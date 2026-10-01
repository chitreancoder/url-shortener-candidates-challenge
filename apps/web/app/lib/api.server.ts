import {
  CLIENT_IP_HEADER,
  ErrorResponse,
  INTERNAL_KEY_HEADER,
  ShortenResponse,
  UrlStatsList,
  type ErrorCode,
} from "@url-shortener/api";
import type { z } from "zod";

import { env } from "@/env.server";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set(INTERNAL_KEY_HEADER, env.INTERNAL_API_KEY);

  let res: Response;
  try {
    res = await fetch(new URL(path, env.API_URL), {
      ...init,
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ApiError(
      "INTERNAL_ERROR",
      "The service is unavailable right now. Please try again later.",
    );
  }

  const body: unknown = await res.json().catch(() => undefined);
  if (res.ok) {
    const parsed = schema.safeParse(body);
    if (parsed.success) return parsed.data;
  } else {
    const parsed = ErrorResponse.safeParse(body);
    if (parsed.success) {
      const { code, message, fieldErrors } = parsed.data.error;
      throw new ApiError(code, message, fieldErrors);
    }
  }
  throw new ApiError("INTERNAL_ERROR", "Unexpected response from the service.");
}

export function shorten(url: string, clientIp: string | undefined) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (clientIp) headers[CLIENT_IP_HEADER] = clientIp;
  return request("/api/shorten", ShortenResponse, {
    method: "POST",
    headers,
    body: JSON.stringify({ url }),
  });
}

export async function listUrls(limit = 50) {
  const { items } = await request(`/api/urls?limit=${limit}`, UrlStatsList);
  return items;
}
