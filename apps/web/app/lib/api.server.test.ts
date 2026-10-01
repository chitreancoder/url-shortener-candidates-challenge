import { CLIENT_IP_HEADER, INTERNAL_KEY_HEADER } from "@url-shortener/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, listUrls, shorten } from "@/lib/api.server";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const errorBody = (code: string, message: string, fieldErrors?: Record<string, string[]>) => ({
  error: { code, message, fieldErrors },
});

const caught = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: unknown) => e,
  );

afterEach(() => fetchMock.mockReset());

describe("api client", () => {
  it("parses a successful shorten and forwards the key and client IP", async () => {
    const created = {
      code: "abc1234",
      shortUrl: "http://api.test/abc1234",
      originalUrl: "https://example.com/",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    fetchMock.mockResolvedValue(json(201, created));

    await expect(shorten("https://example.com", "203.0.113.7")).resolves.toEqual(created);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://api.test/api/shorten");
    const headers = new Headers(init?.headers);
    expect(headers.get(INTERNAL_KEY_HEADER)).toBe("test-internal-key-123");
    expect(headers.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
  });

  it("maps a 400 to an ApiError carrying fieldErrors", async () => {
    fetchMock.mockResolvedValue(
      json(400, errorBody("VALIDATION_ERROR", "Invalid request", { url: ["Bad URL"] })),
    );

    const err = await caught(shorten("nope", undefined));
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: { url: ["Bad URL"] } });
  });

  it("maps a 429 to RATE_LIMITED", async () => {
    fetchMock.mockResolvedValue(json(429, errorBody("RATE_LIMITED", "Too many requests")));

    await expect(shorten("https://example.com", undefined)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("turns a network failure into a friendly unavailable error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(listUrls()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: expect.stringMatching(/unavailable/),
    });
  });

  it("rejects a success body that doesn't match the contract", async () => {
    fetchMock.mockResolvedValue(json(200, { items: [{ code: 1 }] }));

    await expect(listUrls()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Unexpected response from the service.",
    });
  });

  it("rejects a non-JSON error body", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));

    await expect(listUrls()).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
