import {
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import Redis from "ioredis";
import { getApiEnv } from "../env";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private _client!: Redis;

  get client(): Redis {
    return this._client;
  }

  async onModuleInit() {
    const env = getApiEnv();
    this._client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    await this._client.connect();
    this.logger.log("Redis connected");
  }

  async onModuleDestroy() {
    await this._client.quit();
  }
}
