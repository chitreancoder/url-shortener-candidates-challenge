import { Link2Icon } from "lucide-react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-3 py-1.5 font-medium transition-colors hover:bg-muted hover:text-foreground",
    isActive ? "bg-muted text-foreground" : "text-muted-foreground",
  );

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen antialiased">
        <header className="border-b">
          <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
            <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <Link2Icon className="size-5" aria-hidden />
              URL Shortener
            </Link>
            <nav className="flex gap-1 text-sm">
              <NavLink to="/" end className={navLinkClass}>
                Shorten
              </NavLink>
              <NavLink to="/stats" className={navLinkClass}>
                Stats
              </NavLink>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-4 py-12">{children}</main>
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let details = "An unexpected error occurred. Please try again.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Page not found" : `Error ${error.status}`;
    details =
      error.status === 404
        ? "The page you're looking for doesn't exist."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{details}</CardDescription>
      </CardHeader>
      <CardContent className="items-start">
        {stack && (
          <pre className="w-full overflow-x-auto rounded-md bg-muted p-4 text-xs">
            <code>{stack}</code>
          </pre>
        )}
        <Button asChild variant="outline">
          <Link to="/">Back home</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
