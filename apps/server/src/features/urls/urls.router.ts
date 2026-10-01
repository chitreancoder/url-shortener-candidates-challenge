import { createHash, timingSafeEqual } from "node:crypto";
import { CLIENT_IP_HEADER, INTERNAL_KEY_HEADER } from "@url-shortener/api";
import { CODE_PATTERN } from "@url-shortener/engine";
import { type Request, Router } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { sendError } from "@/http/errors";
import type { UrlsService } from "./urls.service";

export interface UrlsRouterOptions {
  internalApiKey: string;
  shortenRateLimit: { limit: number; windowMs: number };
}

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export const createUrlsRouter = (
  urls: UrlsService,
  { internalApiKey, shortenRateLimit }: UrlsRouterOptions,
) => {
  // Hashing gives equal-length buffers, which timingSafeEqual requires.
  const internalKeyHash = sha256(internalApiKey);
  const isInternalCaller = (req: Request) => {
    const key = req.get(INTERNAL_KEY_HEADER);
    return key !== undefined && timingSafeEqual(sha256(key), internalKeyHash);
  };

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

  const router = Router();

  router.post("/api/shorten", shortenLimiter, async (req, res) => {
    res.status(201).json(await urls.shorten(req.body));
  });

  router.get("/api/urls", async (req, res) => {
    res.json(await urls.list(req.query));
  });

  // path-to-regexp v8 has no inline regex params, so the code shape is checked here.
  // no-store + 302 (never 301) so browsers come back on every click and it gets counted.
  router.get("/:code", async (req, res, next) => {
    if (!CODE_PATTERN.test(req.params.code)) return next();
    res.set("Cache-Control", "no-store");
    res.redirect(302, await urls.redirectTarget(req.params.code, req.get("user-agent")));
  });

  return router;
};
