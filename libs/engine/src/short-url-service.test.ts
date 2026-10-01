import { describe, expect, it } from "vitest";
import { CodeGenerationError, NotFoundError } from "./errors";
import { CODE_PATTERN, generateCode } from "./generate-code";
import { InMemoryUrlRepository } from "./in-memory-url-repository";
import { MAX_CODE_ATTEMPTS, ShortUrlService } from "./short-url-service";

/** Returns the given codes in order, then repeats the last one. */
const sequence = (...codes: string[]) => {
  let i = 0;
  return () => codes[Math.min(i++, codes.length - 1)]!;
};

describe("generateCode", () => {
  it("produces 7 base62 characters", () => {
    for (let i = 0; i < 1000; i++) expect(generateCode()).toMatch(CODE_PATTERN);
  });
});

describe("ShortUrlService", () => {
  it("retries on collision until a free code is found", async () => {
    const repo = new InMemoryUrlRepository();
    await repo.create({ code: "AAAAAAA", originalUrl: "https://taken.example" });
    const service = new ShortUrlService(repo, sequence("AAAAAAA", "AAAAAAA", "BBBBBBB"));

    const url = await service.shorten("https://example.com");

    expect(url.code).toBe("BBBBBBB");
    expect((await repo.findByCode("AAAAAAA"))?.originalUrl).toBe("https://taken.example");
  });

  it(`gives up after ${MAX_CODE_ATTEMPTS} collisions`, async () => {
    const repo = new InMemoryUrlRepository();
    await repo.create({ code: "AAAAAAA", originalUrl: "https://taken.example" });
    let calls = 0;
    const service = new ShortUrlService(repo, () => (calls++, "AAAAAAA"));

    await expect(service.shorten("https://example.com")).rejects.toBeInstanceOf(
      CodeGenerationError,
    );
    expect(calls).toBe(MAX_CODE_ATTEMPTS);
  });

  it("resolve throws NotFoundError for an unknown code", async () => {
    const service = new ShortUrlService(new InMemoryUrlRepository(), generateCode);
    await expect(service.resolve("missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("recordClick increments the count and sets lastClickedAt", async () => {
    const service = new ShortUrlService(new InMemoryUrlRepository(), generateCode);
    const { code } = await service.shorten("https://example.com");

    await service.recordClick(code);
    await service.recordClick(code);

    const url = await service.resolve(code);
    expect(url.clickCount).toBe(2);
    expect(url.lastClickedAt).toBeInstanceOf(Date);
  });

  it("listTop sorts by clicks descending and respects the limit", async () => {
    const service = new ShortUrlService(new InMemoryUrlRepository(), generateCode);
    const a = await service.shorten("https://a.example");
    const b = await service.shorten("https://b.example");
    await service.shorten("https://c.example");
    await service.recordClick(b.code);
    await service.recordClick(b.code);
    await service.recordClick(a.code);

    const top = await service.listTop(2);
    expect(top.map((u) => u.originalUrl)).toEqual(["https://b.example", "https://a.example"]);
  });
});
