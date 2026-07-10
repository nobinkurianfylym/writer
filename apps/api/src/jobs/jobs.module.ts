import { Global, Module } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { S3Service } from "./s3.service";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { ExportsService } from "./exports.service";
import { ExportsController } from "./exports.controller";

@Global()
@Module({
  providers: [QueueService, S3Service, JobsService, ExportsService],
  controllers: [JobsController, ExportsController],
  exports: [QueueService, S3Service, JobsService, ExportsService],
})
export class JobsModule {}
