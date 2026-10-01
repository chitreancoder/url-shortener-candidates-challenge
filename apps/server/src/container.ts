import { createPrismaClient, PrismaUrlRepository } from "@url-shortener/db";
import { generateCode, ShortUrlService } from "@url-shortener/engine";
import type { Env } from "@/env";
import { UrlsService } from "@/features/urls/urls.service";

/** Composition root: the only place that knows which implementations are wired together. */
export const createContainer = (env: Env) => {
  const prisma = createPrismaClient(env.DATABASE_URL);
  const shortUrls = new ShortUrlService(new PrismaUrlRepository(prisma), generateCode);
  const urls = new UrlsService(shortUrls, { publicUrl: env.PUBLIC_URL, webUrl: env.WEB_URL });
  const checkDatabase = async () => {
    await prisma.$queryRaw`SELECT 1`;
  };
  return { prisma, urls, checkDatabase };
};
