import "reflect-metadata";
import { initObservability } from "./observability";

// Tracing + Sentry must initialize before Nest/instrumented libraries load.
initObservability();

import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import helmet from "helmet";
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

  // Security headers (§9). The API serves JSON only, so a locked-down CSP is
  // safe; nosniff/frame-deny/referrer/HSTS harden the rest. x-powered-by is
  // removed so we don't advertise the stack.
  const httpAdapter = app.getHttpAdapter().getInstance() as {
    disable: (setting: string) => void;
    set: (setting: string, value: unknown) => void;
  };
  httpAdapter.disable("x-powered-by");
  // Behind Railway/Cloudflare/ALB: trust the first proxy hop so req.ip (used
  // by the rate limiter) and the Secure-cookie/HTTPS detection are correct.
  httpAdapter.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      hsts: process.env.NODE_ENV === "production",
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );

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
    // Let the browser read the download filename for in-process exports.
    exposedHeaders: ["Content-Disposition"],
  });

  await app.listen(env.PORT);
  app.get(Logger).log(`Listening on :${env.PORT}`);
}

void bootstrap();
