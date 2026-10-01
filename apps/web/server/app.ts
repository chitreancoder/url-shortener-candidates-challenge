import { createRequestHandler } from "@react-router/express";
import express from "express";

declare module "react-router" {
  interface AppLoadContext {
    /** Socket peer address. Never read from X-Forwarded-For: the client could spoof it. */
    clientIp: string | undefined;
  }
}

export const app = express();

app.use(
  createRequestHandler({
    build: () => import("virtual:react-router/server-build"),
    getLoadContext: (req) => ({ clientIp: req.socket.remoteAddress }),
  }),
);
