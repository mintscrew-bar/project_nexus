import { StreamerPlatform } from "@nexus/database";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class UpsertStreamerProfileDto {
  @IsEnum(StreamerPlatform, { message: "유효한 방송 플랫폼을 선택해주세요." })
  platform!: StreamerPlatform;

  @IsString()
  @MaxLength(500, { message: "채널 주소는 500자 이하여야 합니다." })
  channelUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80, { message: "채널명은 80자 이하여야 합니다." })
  channelName?: string;
}
