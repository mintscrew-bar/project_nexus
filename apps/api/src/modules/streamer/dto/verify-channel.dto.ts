import { StreamerPlatform } from "@nexus/database";
import { IsEnum } from "class-validator";

export class VerifyChannelDto {
  @IsEnum(StreamerPlatform, { message: "유효한 방송 플랫폼을 선택해주세요." })
  platform!: StreamerPlatform;
}
