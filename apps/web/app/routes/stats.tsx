import type { UrlStats } from "@url-shortener/api";
import { Suspense } from "react";
import { Await, Link } from "react-router";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listUrls } from "@/lib/api.server";
import type { Route } from "./+types/stats";

export function meta() {
  return [{ title: "Stats · URL Shortener" }];
}

// Not awaited: the page shell streams immediately and the table fills in when the API answers.
// `now` comes from the loader so the server render and hydration compute the same relative times.
export function loader() {
  return { urls: listUrls(), now: Date.now() };
}

export default function Stats({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Stats</h1>
        <p className="text-muted-foreground">Your most clicked links.</p>
      </div>
      <Suspense fallback={<StatsSkeleton />}>
        <Await resolve={loaderData.urls} errorElement={<StatsError />}>
          {(urls) =>
            urls.length > 0 ? <StatsTable urls={urls} now={loaderData.now} /> : <EmptyState />
          }
        </Await>
      </Suspense>
    </div>
  );
}

function StatsTable({ urls, now }: { urls: UrlStats[]; now: number }) {
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Short link</TableHead>
            <TableHead>Original URL</TableHead>
            <TableHead className="text-right">Clicks</TableHead>
            <TableHead>Last clicked</TableHead>
            <TableHead className="pr-4">Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {urls.map((url) => (
            <TableRow key={url.code}>
              <TableCell className="pl-4">
                <div className="flex items-center gap-1">
                  <a
                    href={url.shortUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono font-medium underline-offset-4 hover:underline"
                  >
                    {url.code}
                  </a>
                  <CopyButton value={url.shortUrl} compact />
                </div>
              </TableCell>
              <TableCell>
                <span className="block max-w-64 truncate" title={url.originalUrl}>
                  {url.originalUrl}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {url.clickCount.toLocaleString("en-US")}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {url.lastClickedAt ? <RelativeTime iso={url.lastClickedAt} now={now} /> : "Never"}
              </TableCell>
              <TableCell className="pr-4 text-muted-foreground">
                <RelativeTime iso={url.createdAt} now={now} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

// Relative and UTC-based on purpose: a locale/timezone format would differ between the server
// render and the browser and cause hydration mismatches.
function RelativeTime({ iso, now }: { iso: string; now: number }) {
  const date = new Date(iso);
  const seconds = (date.getTime() - now) / 1000;
  const [unit, size] = UNITS.find(([, size]) => Math.abs(seconds) >= size) ?? ["second", 1];
  return (
    <time dateTime={iso} title={date.toUTCString()}>
      {relativeFormat.format(Math.round(seconds / size), unit)}
    </time>
  );
}

function StatsSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading stats">
      <CardContent className="gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="items-center py-12 text-center">
      <CardHeader className="w-full">
        <CardTitle className="text-lg">No links yet</CardTitle>
        <CardDescription>Shorten your first link and its clicks will show up here.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link to="/">Shorten a link</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function StatsError() {
  return (
    <Card role="alert" className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive">Couldn't load stats</CardTitle>
        <CardDescription>The service may be unavailable. Please try again.</CardDescription>
      </CardHeader>
      <CardContent className="items-start">
        <Button asChild variant="outline">
          <Link to="/stats">Try again</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
