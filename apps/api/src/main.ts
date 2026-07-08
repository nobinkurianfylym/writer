import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { loadDotEnvIfPresent, reportEnvErrorAndExit } from "@fylym/config/env";
import { AppModule } from "./app.module";
import { getApiEnv } from "./env";

async function bootstrap() {
  loadDotEnvIfPresent();

  let env;
  try {
    env = getApiEnv();
  } catch (error) {
    reportEnvErrorAndExit(error);
  }

  const app = await NestFactory.create(AppModule);
  await app.listen(env.PORT);
  console.log(`[api] listening on :${env.PORT}`);
}

void bootstrap();
