import { Module } from "@nestjs/common";
import { BroadcastController } from "./broadcast.controller";
import { BroadcastService } from "./broadcast.service";
import { MatchModule } from "../match/match.module";
import { UploadModule } from "../upload/upload.module";
import { UserModule } from "../user/user.module";

@Module({
  imports: [MatchModule, UploadModule, UserModule],
  controllers: [BroadcastController],
  providers: [BroadcastService],
})
export class BroadcastModule {}
