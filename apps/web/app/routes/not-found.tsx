import { data, Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function meta() {
  return [{ title: "Link not found · URL Shortener" }];
}

// The API redirects unknown short codes here; the 404 keeps crawlers from indexing it.
export function loader() {
  return data(null, { status: 404 });
}

export default function NotFound() {
  return (
    <Card className="mx-auto max-w-md text-center">
      <CardHeader>
        <CardTitle className="text-xl">This short link doesn't exist</CardTitle>
        <CardDescription>It may have been mistyped, or it was never created.</CardDescription>
      </CardHeader>
      <CardContent className="items-center">
        <Button asChild>
          <Link to="/">Shorten a new link</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
