import { createApp } from "@/app";
import { createContainer } from "@/container";
import { loadEnv } from "@/env";

const env = loadEnv();
const { prisma, service, checkDatabase } = createContainer(env);

const app = createApp({
  service,
  checkDatabase,
  publicUrl: env.PUBLIC_URL,
  webUrl: env.WEB_URL,
  internalApiKey: env.INTERNAL_API_KEY,
});

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
const server = app.listen(env.PORT, (error) => {
  if (error) throw error;
  console.log(`Server listening on port ${env.PORT}`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
