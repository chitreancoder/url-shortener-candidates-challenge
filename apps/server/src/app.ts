import express from "express";
import helmet from "helmet";
import { createUrlsRouter, type UrlsRouterOptions } from "@/features/urls/urls.router";
import type { UrlsService } from "@/features/urls/urls.service";
import { errorHandler, sendError } from "@/http/errors";

export interface AppDeps {
  urls: UrlsService;
  /** Resolves when the database answers, rejects otherwise. */
  checkDatabase: () => Promise<void>;
  internalApiKey: string;
  shortenRateLimit?: UrlsRouterOptions["shortenRateLimit"];
}

export const createApp = ({
  urls,
  checkDatabase,
  internalApiKey,
  shortenRateLimit = { limit: 10, windowMs: 60_000 },
}: AppDeps) => {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "10kb" }));

  app.get("/health", async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: "ok" });
    } catch (error) {
      console.error("Health check failed", error);
      res.status(503).json({ status: "unavailable" });
    }
  });

  app.use(createUrlsRouter(urls, { internalApiKey, shortenRateLimit }));

  app.use((_req, res) => sendError(res, 404, "NOT_FOUND", "Route not found"));
  app.use(errorHandler);

  return app;
};
