import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { PrismaModule } from "./prisma/prisma.module";
import { OrgModule } from "./org/org.module";
import { AuditModule } from "./audit/audit.module";
import { RbacModule } from "./rbac/rbac.module";
import { AuthModule } from "./auth/auth.module";
import { ProjectsModule } from "./projects/projects.module";
import { ScriptsModule } from "./scripts/scripts.module";
import { JobsModule } from "./jobs/jobs.module";
import { TransliterateModule } from "./transliterate/transliterate.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "res.headers['set-cookie']",
          ],
          censor: "[REDACTED]",
        },
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { colorize: true } }
            : undefined,
      },
    }),
    PrismaModule,
    OrgModule,
    AuditModule,
    RbacModule,
    AuthModule,
    ProjectsModule,
    ScriptsModule,
    JobsModule,
    TransliterateModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
