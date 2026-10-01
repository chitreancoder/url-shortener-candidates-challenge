import { createPrismaClient, PrismaUrlRepository } from "@url-shortener/db";
import { generateCode, ShortUrlService } from "@url-shortener/engine";
import type { Env } from "@/env";

/** Composition root: the only place that knows which implementations are wired together. */
export const createContainer = (env: Env) => {
  const prisma = createPrismaClient(env.DATABASE_URL);
  const service = new ShortUrlService(new PrismaUrlRepository(prisma), generateCode);
  const checkDatabase = async () => {
    await prisma.$queryRaw`SELECT 1`;
  };
  return { prisma, service, checkDatabase };
};
