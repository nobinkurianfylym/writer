import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { PrismaModule } from "./prisma/prisma.module";
import { OrgModule } from "./org/org.module";
import { AuditModule } from "./audit/audit.module";
import { RbacModule } from "./rbac/rbac.module";
import { AuthModule } from "./auth/auth.module";
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
