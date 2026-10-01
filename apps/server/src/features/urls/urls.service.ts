import {
  ListUrlsQuery,
  makeShortenRequestSchema,
  type ShortenResponse,
  type UrlStats,
  type UrlStatsList,
} from "@url-shortener/api";
import { NotFoundError, type ShortUrlService, type Url } from "@url-shortener/engine";
import { isbot } from "isbot";

export interface UrlsServiceConfig {
  /** Short-link base, without trailing slash. */
  publicUrl: string;
  /** Web app base, without trailing slash; unknown codes redirect to its not-found page. */
  webUrl: string;
}

/**
 * Application layer for the urls feature: validates input against the shared contract,
 * delegates to the domain service and maps entities to response DTOs. No HTTP here.
 */
export class UrlsService {
  // Rejects links to our own short-link host, which would redirect in a loop.
  private readonly shortenRequest;

  constructor(
    private readonly shortUrls: ShortUrlService,
    private readonly config: UrlsServiceConfig,
  ) {
    this.shortenRequest = makeShortenRequestSchema([new URL(config.publicUrl).host]);
  }

  async shorten(body: unknown): Promise<ShortenResponse> {
    const { url } = this.shortenRequest.parse(body);
    const created = await this.shortUrls.shorten(url);
    return {
      code: created.code,
      shortUrl: this.shortUrl(created.code),
      originalUrl: created.originalUrl,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async list(query: unknown): Promise<UrlStatsList> {
    const { limit } = ListUrlsQuery.parse(query);
    const urls = await this.shortUrls.listTop(limit);
    return { items: urls.map((url) => this.toStats(url)) };
  }

  /** Where a short-link visit should go. Counts the click unless the visitor is a bot. */
  async redirectTarget(code: string, userAgent: string | undefined): Promise<string> {
    try {
      const url = await this.shortUrls.resolve(code);
      // Link-preview crawlers would otherwise inflate the counts.
      if (!isbot(userAgent)) await this.shortUrls.recordClick(code);
      return url.originalUrl;
    } catch (error) {
      if (!(error instanceof NotFoundError)) throw error;
      return `${this.config.webUrl}/not-found`;
    }
  }

  private shortUrl(code: string) {
    return `${this.config.publicUrl}/${code}`;
  }

  private toStats(url: Url): UrlStats {
    return {
      code: url.code,
      shortUrl: this.shortUrl(url.code),
      originalUrl: url.originalUrl,
      clickCount: url.clickCount,
      lastClickedAt: url.lastClickedAt?.toISOString() ?? null,
      createdAt: url.createdAt.toISOString(),
    };
  }
}
