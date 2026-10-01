import { PrismaPg } from "@prisma/adapter-pg";
import {
  CodeCollisionError,
  type NewUrl,
  type Url,
  type UrlRepository,
} from "@url-shortener/engine";
import { Prisma, PrismaClient } from "./generated/prisma/client";

export const createPrismaClient = (databaseUrl: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

// The Prisma row has exactly the engine Url fields today; the explicit mapping keeps the
// domain type from silently picking up new columns.
const toUrl = ({ code, originalUrl, clickCount, lastClickedAt, createdAt }: Url): Url => ({
  code,
  originalUrl,
  clickCount,
  lastClickedAt,
  createdAt,
});

export class PrismaUrlRepository implements UrlRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: NewUrl): Promise<Url> {
    try {
      return toUrl(await this.prisma.url.create({ data }));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new CodeCollisionError(data.code);
      }
      throw error;
    }
  }

  async findByCode(code: string): Promise<Url | null> {
    const row = await this.prisma.url.findUnique({ where: { code } });
    return row && toUrl(row);
  }

  // updateMany, not update: a missing code yields count 0 instead of throwing P2025.
  async incrementClicks(code: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.url.updateMany({
      where: { code },
      data: { clickCount: { increment: 1 }, lastClickedAt: at },
    });
    return count > 0;
  }

  async listTopByClicks(limit: number): Promise<Url[]> {
    const rows = await this.prisma.url.findMany({
      orderBy: [{ clickCount: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    return rows.map(toUrl);
  }
}
