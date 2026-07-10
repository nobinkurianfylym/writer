import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import { json, urlencoded } from "express";
import { loadDotEnvIfPresent, reportEnvErrorAndExit } from "@fylym/config/env";
import { AppModule } from "./app.module";
import { HttpErrorFilter } from "./filters/http-error.filter";
import { getApiEnv } from "./env";

async function bootstrap() {
  loadDotEnvIfPresent();

  let env;
  try {
    env = getApiEnv();
  } catch (error) {
    reportEnvErrorAndExit(error);
  }

  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  // Script state uploads carry base64 Yjs payloads well past the 100kb
  // express default; ceiling enforcement happens per-plan in the service.
  app.use(json({ limit: "64mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());
  app.useGlobalFilters(new HttpErrorFilter());

  // Credentialed CORS for the browser app: the refresh-token cookie and
  // Bearer requests come from a different origin (web on :3000, api on :3001).
  app.enableCors({
    origin: env.CORS_ORIGIN ?? env.APP_URL,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  });

  await app.listen(env.PORT);
  app.get(Logger).log(`Listening on :${env.PORT}`);
}

void bootstrap();
