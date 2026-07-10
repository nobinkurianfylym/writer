import { Module } from "@nestjs/common";
import { ScriptsService } from "./scripts.service";
import { ScriptsController } from "./scripts.controller";
import { ScriptStateService } from "./script-state.service";
import { SnapshotsService } from "./snapshots.service";
import { ScriptStateController } from "./script-state.controller";

@Module({
  providers: [ScriptsService, ScriptStateService, SnapshotsService],
  controllers: [ScriptsController, ScriptStateController],
  exports: [ScriptsService, ScriptStateService, SnapshotsService],
})
export class ScriptsModule {}
