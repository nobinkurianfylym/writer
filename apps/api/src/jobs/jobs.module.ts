import { Global, Module } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { S3Service } from "./s3.service";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";

@Global()
@Module({
  providers: [QueueService, S3Service, JobsService],
  controllers: [JobsController],
  exports: [QueueService, S3Service, JobsService],
})
export class JobsModule {}
