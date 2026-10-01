import type { NewUrl, Url } from "./url";

/**
 * Persistence port. Implementations must throw CodeCollisionError when `create`
 * hits an existing code, and must increment atomically (no read-then-write).
 */
export interface UrlRepository {
  create(data: NewUrl): Promise<Url>;
  findByCode(code: string): Promise<Url | null>;
  /** Returns false when the code does not exist. */
  incrementClicks(code: string, at: Date): Promise<boolean>;
  listTopByClicks(limit: number): Promise<Url[]>;
}
