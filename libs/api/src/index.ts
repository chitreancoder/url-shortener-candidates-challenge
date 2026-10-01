import { z } from "zod";

export const MAX_URL_LENGTH = 2048;

/**
 * Builds the shorten-request schema. `blockedHosts` lets the server reject links to its
 * own short-link host (they would redirect in a loop); the browser omits it.
 */
export const makeShortenRequestSchema = (blockedHosts: string[] = []) =>
  z.object({
    url: z
      .string({ error: "URL is required" })
      .trim()
      .min(1, "URL is required")
      .max(MAX_URL_LENGTH, `URL must be at most ${MAX_URL_LENGTH} characters`)
      .transform((value, ctx) => {
        let parsed: URL;
        try {
          parsed = new URL(value);
        } catch {
          ctx.addIssue({ code: "custom", message: "Enter a valid URL, e.g. https://example.com" });
          return z.NEVER;
        }
        // Allowlist, not blocklist: rules out javascript:, data:, file:, etc.
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          ctx.addIssue({ code: "custom", message: "Only http and https URLs are allowed" });
          return z.NEVER;
        }
        if (blockedHosts.includes(parsed.host)) {
          ctx.addIssue({ code: "custom", message: "This URL is already a short link" });
          return z.NEVER;
        }
        return parsed.href;
      }),
  });

export const ShortenRequest = makeShortenRequestSchema();
export type ShortenRequest = z.infer<typeof ShortenRequest>;

export const ShortenResponse = z.object({
  code: z.string(),
  shortUrl: z.url(),
  originalUrl: z.url(),
  createdAt: z.iso.datetime(),
});
export type ShortenResponse = z.infer<typeof ShortenResponse>;

export const UrlStats = z.object({
  code: z.string(),
  shortUrl: z.url(),
  originalUrl: z.url(),
  clickCount: z.number().int().nonnegative(),
  lastClickedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type UrlStats = z.infer<typeof UrlStats>;

export const UrlStatsList = z.object({ items: z.array(UrlStats) });
export type UrlStatsList = z.infer<typeof UrlStatsList>;

export const ListUrlsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListUrlsQuery = z.infer<typeof ListUrlsQuery>;

export const ErrorCode = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

/** Header names for the web -> API trusted client-IP forwarding (DECISIONS §8.1). */
export const INTERNAL_KEY_HEADER = "x-internal-api-key";
export const CLIENT_IP_HEADER = "x-client-ip";
