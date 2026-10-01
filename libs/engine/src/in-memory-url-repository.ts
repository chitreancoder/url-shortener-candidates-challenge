import { CodeCollisionError } from "./errors";
import type { NewUrl, Url } from "./url";
import type { UrlRepository } from "./url-repository";

/** Test double for UrlRepository. Not for production: state dies with the process. */
export class InMemoryUrlRepository implements UrlRepository {
  private readonly urls = new Map<string, Url>();

  async create({ code, originalUrl }: NewUrl): Promise<Url> {
    if (this.urls.has(code)) throw new CodeCollisionError(code);
    const url: Url = {
      code,
      originalUrl,
      clickCount: 0,
      lastClickedAt: null,
      createdAt: new Date(),
    };
    this.urls.set(code, url);
    return { ...url };
  }

  async findByCode(code: string): Promise<Url | null> {
    const url = this.urls.get(code);
    return url ? { ...url } : null;
  }

  async incrementClicks(code: string, at: Date): Promise<boolean> {
    const url = this.urls.get(code);
    if (!url) return false;
    url.clickCount++;
    url.lastClickedAt = at;
    return true;
  }

  async listTopByClicks(limit: number): Promise<Url[]> {
    return [...this.urls.values()]
      .sort((a, b) => b.clickCount - a.clickCount)
      .slice(0, limit)
      .map((url) => ({ ...url }));
  }
}
