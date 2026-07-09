import { Global, Module } from "@nestjs/common";
import { JwtService } from "./jwt.service";
import { RedisService } from "./redis.service";
import { AuthService } from "./auth.service";
import { MailService } from "./mail.service";
import { AuthController } from "./auth.controller";
import { JwtGuard } from "./jwt.guard";
import { RateLimitGuard } from "./rate-limit.guard";

@Global()
@Module({
  providers: [
    JwtService,
    RedisService,
    AuthService,
    MailService,
    JwtGuard,
    RateLimitGuard,
  ],
  controllers: [AuthController],
  exports: [JwtService, RedisService, AuthService, JwtGuard],
})
export class AuthModule {}
