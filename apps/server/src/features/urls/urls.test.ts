import {
  CLIENT_IP_HEADER,
  ErrorResponse,
  INTERNAL_KEY_HEADER,
  ShortenResponse,
  UrlStatsList,
} from "@url-shortener/api";
import { generateCode, InMemoryUrlRepository, ShortUrlService } from "@url-shortener/engine";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { type AppDeps, createApp } from "@/app";
import { UrlsService } from "@/features/urls/urls.service";

const PUBLIC_URL = "http://short.test";
const WEB_URL = "http://web.test";
const INTERNAL_API_KEY = "internal-key-0123456789";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const BOT_UA = "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)";

const setup = ({
  service = new ShortUrlService(new InMemoryUrlRepository(), generateCode),
  ...overrides
}: Partial<Omit<AppDeps, "urls">> & { service?: ShortUrlService } = {}) => {
  const deps: AppDeps = {
    urls: new UrlsService(service, { publicUrl: PUBLIC_URL, webUrl: WEB_URL }),
    checkDatabase: async () => {},
    internalApiKey: INTERNAL_API_KEY,
    shortenRateLimit: { limit: 100, windowMs: 60_000 },
    ...overrides,
  };
  return { app: createApp(deps), service };
};

const expectErrorEnvelope = (body: unknown, code: string) => {
  const parsed = ErrorResponse.parse(body);
  expect(parsed.error.code).toBe(code);
  return parsed.error;
};

describe("POST /api/shorten", () => {
  it("creates a short link", async () => {
    const { app } = setup();
    const res = await request(app).post("/api/shorten").send({ url: " https://example.com/a " });

    expect(res.status).toBe(201);
    const body = ShortenResponse.parse(res.body);
    expect(body.originalUrl).toBe("https://example.com/a");
    expect(body.shortUrl).toBe(`${PUBLIC_URL}/${body.code}`);
  });

  it.each([
    ["bad scheme", { url: "javascript:alert(1)" }],
    ["missing url", {}],
    ["own host", { url: `${PUBLIC_URL}/abcdefg` }],
  ])("rejects %s with a 400 envelope", async (_name, payload) => {
    const { app } = setup();
    const res = await request(app).post("/api/shorten").send(payload);

    expect(res.status).toBe(400);
    const error = expectErrorEnvelope(res.body, "VALIDATION_ERROR");
    expect(error.fieldErrors?.url?.length).toBeGreaterThan(0);
  });

  it("rejects malformed JSON with a 400 envelope", async () => {
    const { app } = setup();
    const res = await request(app)
      .post("/api/shorten")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
    expectErrorEnvelope(res.body, "VALIDATION_ERROR");
  });

  it("returns a generic 500 when no free code is found", async () => {
    const repo = new InMemoryUrlRepository();
    await repo.create({ code: "AAAAAAA", originalUrl: "https://taken.example" });
    const { app } = setup({ service: new ShortUrlService(repo, () => "AAAAAAA") });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).post("/api/shorten").send({ url: "https://example.com" });

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
    });
  });
});

describe("rate limiting", () => {
  const limited = () => setup({ shortenRateLimit: { limit: 2, windowMs: 60_000 } }).app;
  const shorten = (app: ReturnType<typeof limited>, headers: Record<string, string> = {}) =>
    request(app).post("/api/shorten").set(headers).send({ url: "https://example.com" });

  it("returns a 429 envelope with RateLimit headers after the limit", async () => {
    const app = limited();
    expect((await shorten(app)).status).toBe(201);
    expect((await shorten(app)).status).toBe(201);
    const res = await shorten(app);

    expect(res.status).toBe(429);
    expectErrorEnvelope(res.body, "RATE_LIMITED");
    expect(res.headers["ratelimit-policy"]).toBeDefined();
  });

  it("ignores a forwarded client IP without the internal key", async () => {
    const app = limited();
    await shorten(app, { [CLIENT_IP_HEADER]: "1.1.1.1" });
    await shorten(app, { [CLIENT_IP_HEADER]: "2.2.2.2" });
    const res = await shorten(app, { [CLIENT_IP_HEADER]: "3.3.3.3" });

    expect(res.status).toBe(429);
  });

  it("ignores a forwarded client IP with a wrong internal key", async () => {
    const app = limited();
    const wrongKey = { [INTERNAL_KEY_HEADER]: "wrong" };
    await shorten(app, { ...wrongKey, [CLIENT_IP_HEADER]: "1.1.1.1" });
    await shorten(app, { ...wrongKey, [CLIENT_IP_HEADER]: "2.2.2.2" });
    const res = await shorten(app, { ...wrongKey, [CLIENT_IP_HEADER]: "3.3.3.3" });

    expect(res.status).toBe(429);
  });

  it("buckets by forwarded client IP when the internal key matches", async () => {
    const app = limited();
    const as = (ip: string) => ({
      [INTERNAL_KEY_HEADER]: INTERNAL_API_KEY,
      [CLIENT_IP_HEADER]: ip,
    });
    await shorten(app, as("1.1.1.1"));
    await shorten(app, as("1.1.1.1"));

    expect((await shorten(app, as("1.1.1.1"))).status).toBe(429);
    expect((await shorten(app, as("2.2.2.2"))).status).toBe(201);
  });
});

describe("GET /:code", () => {
  it("redirects with no-store and counts the click", async () => {
    const { app, service } = setup();
    const { code } = await service.shorten("https://example.com/target");

    const res = await request(app).get(`/${code}`).set("User-Agent", BROWSER_UA);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://example.com/target");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect((await service.resolve(code)).clickCount).toBe(1);
  });

  it("redirects bots without counting", async () => {
    const { app, service } = setup();
    const { code } = await service.shorten("https://example.com/target");

    const res = await request(app).get(`/${code}`).set("User-Agent", BOT_UA);

    expect(res.status).toBe(302);
    expect((await service.resolve(code)).clickCount).toBe(0);
  });

  it("redirects an unknown code to the web not-found page", async () => {
    const { app } = setup();
    const res = await request(app).get("/Zzzzzzz");

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`${WEB_URL}/not-found`);
  });

  it("returns a 404 envelope for paths that are not codes", async () => {
    const { app } = setup();
    const res = await request(app).get("/abc");

    expect(res.status).toBe(404);
    expectErrorEnvelope(res.body, "NOT_FOUND");
  });
});

describe("GET /api/urls", () => {
  it("lists links sorted by clicks and honours the limit", async () => {
    const { app, service } = setup();
    const a = await service.shorten("https://a.example/");
    const b = await service.shorten("https://b.example/");
    await service.shorten("https://c.example/");
    await service.recordClick(b.code);
    await service.recordClick(b.code);
    await service.recordClick(a.code);

    const res = await request(app).get("/api/urls?limit=2");

    expect(res.status).toBe(200);
    const { items } = UrlStatsList.parse(res.body);
    expect(items.map((i) => [i.code, i.clickCount])).toEqual([
      [b.code, 2],
      [a.code, 1],
    ]);
    expect(items[0]!.shortUrl).toBe(`${PUBLIC_URL}/${b.code}`);
  });

  it("returns null lastClickedAt for never-clicked links", async () => {
    const { app, service } = setup();
    await service.shorten("https://a.example/");

    const { items } = UrlStatsList.parse((await request(app).get("/api/urls")).body);
    expect(items[0]!.lastClickedAt).toBeNull();
  });

  it("rejects an invalid limit", async () => {
    const { app } = setup();
    const res = await request(app).get("/api/urls?limit=0");

    expect(res.status).toBe(400);
    expect(expectErrorEnvelope(res.body, "VALIDATION_ERROR").fieldErrors?.limit).toBeDefined();
  });
});

describe("GET /health", () => {
  it("is ok when the database answers", async () => {
    const res = await request(setup().app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("is 503 when the database is down", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { app } = setup({ checkDatabase: () => Promise.reject(new Error("down")) });
    expect((await request(app).get("/health")).status).toBe(503);
  });
});
