import { describe, expect, it } from "vitest";
import { MAX_URL_LENGTH, makeShortenRequestSchema, ShortenRequest } from "./index";

const parse = (url: unknown) => ShortenRequest.safeParse({ url });

describe("ShortenRequest", () => {
  it.each([
    "https://example.com",
    "http://example.com/path?q=1#x",
    "https://sub.example.co.uk:8080/a",
  ])("accepts %s", (url) => expect(parse(url).success).toBe(true));

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["missing", undefined],
    ["not a string", 42],
    ["malformed", "not a url"],
    ["no scheme", "example.com"],
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["ftp:", "ftp://example.com/file"],
    ["too long", `https://example.com/${"a".repeat(MAX_URL_LENGTH)}`],
    // Short enough as typed, but percent-encoding grows it 6x past the limit.
    ["too long once encoded", `https://example.com/${"é".repeat(1000)}`],
  ])("rejects %s", (_, url) => {
    const result = parse(url);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["url"]);
  });

  it("trims and normalizes", () => {
    expect(parse("  HTTPS://Example.COM  ").data?.url).toBe("https://example.com/");
  });

  it("rejects the blocked short-link host", () => {
    const schema = makeShortenRequestSchema(["localhost:4000"]);
    expect(schema.safeParse({ url: "http://localhost:4000/abcdefg" }).success).toBe(false);
    expect(schema.safeParse({ url: "http://localhost:3000/" }).success).toBe(true);
  });
});
