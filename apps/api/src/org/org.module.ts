import { Global, Module } from "@nestjs/common";
import { OrgService } from "./org.service";
import { OrgController } from "./org.controller";

@Global()
@Module({
  providers: [OrgService],
  controllers: [OrgController],
  exports: [OrgService],
})
export class OrgModule {}
