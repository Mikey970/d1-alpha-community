import { loadWebTigerEnv } from "./env";

async function bootstrap() {
  loadWebTigerEnv();
  const { createTigerServer } = await import("./create-tiger-server");
  await createTigerServer();
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[web-tiger] failed to start", err);
  process.exit(1);
});
