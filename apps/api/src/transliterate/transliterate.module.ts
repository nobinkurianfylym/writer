import { Module } from "@nestjs/common";
import { TransliterateService } from "./transliterate.service";
import { TransliterateController } from "./transliterate.controller";

@Module({
  providers: [TransliterateService],
  controllers: [TransliterateController],
})
export class TransliterateModule {}
