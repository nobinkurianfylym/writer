import { Module } from "@nestjs/common";
import { ScriptsService } from "./scripts.service";
import { ScriptsController } from "./scripts.controller";
import { ScriptStateService } from "./script-state.service";
import { SnapshotsService } from "./snapshots.service";
import { ScriptStateController } from "./script-state.controller";
import { BeatsService } from "./beats.service";
import { BeatsController } from "./beats.controller";

@Module({
  providers: [ScriptsService, ScriptStateService, SnapshotsService, BeatsService],
  controllers: [ScriptsController, ScriptStateController, BeatsController],
  exports: [ScriptsService, ScriptStateService, SnapshotsService, BeatsService],
})
export class ScriptsModule {}
