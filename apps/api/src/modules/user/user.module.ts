import { Module } from "@nestjs/common";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { UserSettingsService } from "./user-settings.service";
import { UploadModule } from "../upload/upload.module";
import { DiscordModule } from "../discord/discord.module";
import { ReputationModule } from "../reputation/reputation.module";

@Module({
  imports: [UploadModule, DiscordModule, ReputationModule],
  controllers: [UserController],
  providers: [UserService, UserSettingsService],
  exports: [UserService, UserSettingsService],
})
export class UserModule {}
