import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { RedisService } from "./redis.service";

const DEFAULT_MAX = 20;
const DEFAULT_WINDOW_SEC = 60;

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const key = `rl:${request.ip ?? "unknown"}:${request.path}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - DEFAULT_WINDOW_SEC;

    const multi = this.redis.client.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zadd(key, now, `${now}:${Math.random()}`);
    multi.zcard(key);
    multi.expire(key, DEFAULT_WINDOW_SEC);
    const results = await multi.exec();

    const count = (results?.[2]?.[1] as number) ?? 0;
    const remaining = Math.max(0, DEFAULT_MAX - count);
    const reset = now + DEFAULT_WINDOW_SEC;

    response.setHeader("RateLimit-Limit", DEFAULT_MAX);
    response.setHeader("RateLimit-Remaining", remaining);
    response.setHeader("RateLimit-Reset", reset);

    if (count > DEFAULT_MAX) {
      response.setHeader("Retry-After", DEFAULT_WINDOW_SEC);
      throw new HttpException(
        "Too many requests",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
