import { Injectable, type OnModuleInit, type OnModuleDestroy } from "@nestjs/common";
import { createPrismaClient, type PrismaClient } from "@fylym/db";

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private client: PrismaClient;

  constructor() {
    this.client = createPrismaClient(process.env.DATABASE_URL);
  }

  get db(): PrismaClient {
    return this.client;
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
