import { z } from "zod";

const Env = z.object({
  API_URL: z.url(),
  INTERNAL_API_KEY: z.string().min(16),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`);
}

export const env = parsed.data;
