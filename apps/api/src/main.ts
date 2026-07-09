import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
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

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new HttpErrorFilter());

  await app.listen(env.PORT);
  app.get(Logger).log(`Listening on :${env.PORT}`);
}

void bootstrap();
