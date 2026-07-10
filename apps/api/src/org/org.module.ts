import { Global, Module } from "@nestjs/common";
import { OrgService } from "./org.service";

@Global()
@Module({
  providers: [OrgService],
  exports: [OrgService],
})
export class OrgModule {}
