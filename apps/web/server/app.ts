import { createRequestHandler } from "@react-router/express";
import express from "express";

// Imported here, not only by routes, so bad config crashes at boot: the route build loads lazily.
import "@/env.server";

declare module "react-router" {
  interface AppLoadContext {
    /** Socket peer address. Never read from X-Forwarded-For: the client could spoof it. */
    clientIp: string | undefined;
  }
}

export const app = express();
// A mounted sub-app sets its own header, so server.js disabling it isn't enough.
app.disable("x-powered-by");

app.use(
  createRequestHandler({
    build: () => import("virtual:react-router/server-build"),
    getLoadContext: (req) => ({ clientIp: req.socket.remoteAddress }),
  }),
);
