import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap() {
  if (!process.env.BFF_SERVICE_TOKEN) {
    // All API authorization depends on this shared secret — refuse to boot
    // without it rather than failing open or only failing per-request.
    throw new Error("BFF_SERVICE_TOKEN is not set — refusing to start.");
  }

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3001;
  // Listen on all interfaces so the container is reachable on the private
  // compose network (the BFF in Next is the only thing that talks to us).
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
