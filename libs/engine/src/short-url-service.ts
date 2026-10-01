import { CodeCollisionError, CodeGenerationError, NotFoundError } from "./errors";
import type { CodeGenerator } from "./generate-code";
import type { Url } from "./url";
import type { UrlRepository } from "./url-repository";

export const MAX_CODE_ATTEMPTS = 5;

export class ShortUrlService {
  constructor(
    private readonly repository: UrlRepository,
    private readonly generateCode: CodeGenerator,
  ) {}

  /**
   * The DB unique constraint is the source of truth: insert and retry on collision
   * instead of check-then-insert, which would race.
   */
  async shorten(originalUrl: string): Promise<Url> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      try {
        return await this.repository.create({ code: this.generateCode(), originalUrl });
      } catch (error) {
        if (!(error instanceof CodeCollisionError)) throw error;
      }
    }
    throw new CodeGenerationError(`No free code after ${MAX_CODE_ATTEMPTS} attempts`);
  }

  async resolve(code: string): Promise<Url> {
    const url = await this.repository.findByCode(code);
    if (!url) throw new NotFoundError(`Unknown code: ${code}`);
    return url;
  }

  async recordClick(code: string): Promise<void> {
    const found = await this.repository.incrementClicks(code, new Date());
    if (!found) throw new NotFoundError(`Unknown code: ${code}`);
  }

  listTop(limit: number): Promise<Url[]> {
    return this.repository.listTopByClicks(limit);
  }
}
