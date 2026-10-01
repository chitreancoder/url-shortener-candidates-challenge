import { ShortenRequest, type ShortenResponse } from "@url-shortener/api";
import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { data, Form, Link, useNavigation } from "react-router";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, shorten } from "@/lib/api.server";
import type { Route } from "./+types/_index";

type ActionData = {
  result?: ShortenResponse;
  /** Echoed back on errors so the input keeps its value when JavaScript is off. */
  url?: string;
  fieldError?: string;
  formError?: string;
};

export function meta() {
  return [
    { title: "URL Shortener" },
    { name: "description", content: "Shorten your URLs quickly and easily" },
  ];
}

export async function action({ request, context }: Route.ActionArgs) {
  const raw = (await request.formData()).get("url");
  const url = typeof raw === "string" ? raw : undefined;

  const parsed = ShortenRequest.safeParse({ url });
  if (!parsed.success) {
    return data<ActionData>({ url, fieldError: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    return data<ActionData>({ result: await shorten(parsed.data.url, context.clientIp) });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.code === "RATE_LIMITED") {
      return data<ActionData>(
        { url, formError: "Too many links created. Try again in a minute." },
        { status: 429 },
      );
    }
    const fieldError = error.fieldErrors?.url?.[0];
    if (fieldError) return data<ActionData>({ url, fieldError }, { status: 400 });
    return data<ActionData>({ url, formError: error.message }, { status: 502 });
  }
}

export default function Home({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [clientError, setClientError] = useState<string>();

  const result = actionData?.result;
  const fieldError = clientError ?? actionData?.fieldError;

  useEffect(() => {
    if (result) formRef.current?.reset();
  }, [result]);

  function validate(event: React.FormEvent<HTMLFormElement>) {
    const parsed = ShortenRequest.safeParse({ url: inputRef.current?.value });
    if (parsed.success) {
      setClientError(undefined);
      return;
    }
    event.preventDefault();
    setClientError(parsed.error.issues[0]?.message);
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Shorten a link</h1>
        <p className="text-muted-foreground">
          Paste a long URL to get a short link you can share and track.
        </p>
      </div>

      {/* noValidate: the shared schema gives the same messages client- and server-side. */}
      <Form method="post" ref={formRef} onSubmit={validate} noValidate className="space-y-2">
        <Label htmlFor="url">Long URL</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            ref={inputRef}
            id="url"
            name="url"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://example.com/a/very/long/path"
            defaultValue={actionData?.url}
            onChange={() => setClientError(undefined)}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "url-error" : undefined}
            className="h-10"
          />
          <Button type="submit" size="lg" disabled={submitting} className="h-10 px-4">
            {submitting && <Loader2Icon className="animate-spin" aria-hidden />}
            {submitting ? "Shortening…" : "Shorten"}
          </Button>
        </div>
        {fieldError && (
          <p id="url-error" className="text-sm text-destructive">
            {fieldError}
          </p>
        )}
        {actionData?.formError && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {actionData.formError}
          </p>
        )}
      </Form>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Your short link is ready</CardTitle>
            <CardDescription className="truncate" title={result.originalUrl}>
              {result.originalUrl}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-row items-center gap-2">
            <a
              href={result.shortUrl}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate font-mono text-lg font-medium underline-offset-4 hover:underline"
            >
              {result.shortUrl}
            </a>
            <CopyButton value={result.shortUrl} />
          </CardContent>
          <CardFooter>
            <Button asChild variant="link" className="px-0">
              <Link to="/stats">
                View stats <ArrowRightIcon />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  );
}
