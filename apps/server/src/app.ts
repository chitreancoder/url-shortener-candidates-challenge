import { createHash, timingSafeEqual } from "node:crypto";
import {
  CLIENT_IP_HEADER,
  type ErrorCode,
  type ErrorResponse,
  INTERNAL_KEY_HEADER,
  ListUrlsQuery,
  makeShortenRequestSchema,
  type ShortenResponse,
  type UrlStats,
  type UrlStatsList,
} from "@url-shortener/api";
import { CODE_PATTERN, NotFoundError, type ShortUrlService } from "@url-shortener/engine";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { isbot } from "isbot";
import { z } from "zod";

export interface AppDeps {
  service: ShortUrlService;
  /** Resolves when the database answers, rejects otherwise. */
  checkDatabase: () => Promise<void>;
  /** Short-link base, without trailing slash. */
  publicUrl: string;
  /** Web app base, without trailing slash; unknown codes redirect to its not-found page. */
  webUrl: string;
  internalApiKey: string;
  shortenRateLimit?: { limit: number; windowMs: number };
}

const sendError = (
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
) => {
  const body: ErrorResponse = { error: { code, message, fieldErrors } };
  res.status(status).json(body);
};

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export const createApp = ({
  service,
  checkDatabase,
  publicUrl,
  webUrl,
  internalApiKey,
  shortenRateLimit = { limit: 10, windowMs: 60_000 },
}: AppDeps) => {
  const ShortenRequest = makeShortenRequestSchema([new URL(publicUrl).host]);
  // Hashing gives equal-length buffers, which timingSafeEqual requires.
  const internalKeyHash = sha256(internalApiKey);
  const isInternalCaller = (req: Request) => {
    const key = req.get(INTERNAL_KEY_HEADER);
    return key !== undefined && timingSafeEqual(sha256(key), internalKeyHash);
  };

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

  const shortenLimiter = rateLimit({
    ...shortenRateLimit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // The web app calls us server-side, so every form submit arrives from its IP. It
    // forwards the browser's IP with the shared secret; without the secret the header
    // is ignored, otherwise anyone could spoof a fresh IP per request. trust proxy stays
    // off for the same reason.
    keyGenerator: (req) => {
      const forwardedIp = req.get(CLIENT_IP_HEADER);
      const ip = forwardedIp && isInternalCaller(req) ? forwardedIp : req.socket.remoteAddress;
      return ipKeyGenerator(ip ?? "unknown");
    },
    handler: (_req, res) =>
      sendError(res, 429, "RATE_LIMITED", "Too many requests, please try again later"),
  });

  app.post("/api/shorten", shortenLimiter, async (req, res) => {
    const { url } = ShortenRequest.parse(req.body);
    const created = await service.shorten(url);
    const body: ShortenResponse = {
      code: created.code,
      shortUrl: `${publicUrl}/${created.code}`,
      originalUrl: created.originalUrl,
      createdAt: created.createdAt.toISOString(),
    };
    res.status(201).json(body);
  });

  app.get("/api/urls", async (req, res) => {
    const { limit } = ListUrlsQuery.parse(req.query);
    const urls = await service.listTop(limit);
    const items = urls.map((url): UrlStats => ({
      code: url.code,
      shortUrl: `${publicUrl}/${url.code}`,
      originalUrl: url.originalUrl,
      clickCount: url.clickCount,
      lastClickedAt: url.lastClickedAt?.toISOString() ?? null,
      createdAt: url.createdAt.toISOString(),
    }));
    const body: UrlStatsList = { items };
    res.json(body);
  });

  // path-to-regexp v8 has no inline regex params, so the code shape is checked here.
  // no-store + 302 (never 301) so browsers come back on every click and it gets counted.
  app.get("/:code", async (req, res, next) => {
    const { code } = req.params;
    if (!CODE_PATTERN.test(code)) return next();
    res.set("Cache-Control", "no-store");
    try {
      const url = await service.resolve(code);
      // Link-preview crawlers would otherwise inflate the counts.
      if (!isbot(req.get("user-agent"))) await service.recordClick(code);
      res.redirect(302, url.originalUrl);
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
      res.redirect(302, `${webUrl}/not-found`);
    }
  });

  app.use((_req, res) => sendError(res, 404, "NOT_FOUND", "Route not found"));

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) {
      const { fieldErrors } = z.flattenError(error);
      return sendError(res, 400, "VALIDATION_ERROR", "Invalid request", fieldErrors);
    }
    // body-parser errors: malformed JSON (400), body over the limit (413), etc.
    if (error?.type && typeof error.status === "number" && error.status < 500) {
      const message =
        error.type === "entity.parse.failed" ? "Request body is not valid JSON" : error.message;
      return sendError(res, error.status, "VALIDATION_ERROR", message);
    }
    if (error instanceof NotFoundError) {
      return sendError(res, 404, "NOT_FOUND", error.message);
    }
    console.error(error);
    sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
  };
  app.use(errorHandler);

  return app;
};
