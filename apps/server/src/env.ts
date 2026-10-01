import { z } from "zod";

// No trailing slash: short links are built as `${PUBLIC_URL}/${code}`.
const baseUrl = z.url().transform((url) => url.replace(/\/+$/, ""));

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  PUBLIC_URL: baseUrl,
  WEB_URL: baseUrl,
  INTERNAL_API_KEY: z.string().min(16),
});
export type Env = z.infer<typeof Env>;

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const result = Env.safeParse(source);
  if (!result.success) {
    console.error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data;
};
