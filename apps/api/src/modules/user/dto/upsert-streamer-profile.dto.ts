import { GameTitle, StreamerPlatform } from "@nexus/database";
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

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

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: "방송 게임을 하나 이상 선택해주세요." })
  @IsEnum(GameTitle, {
    each: true,
    message: "유효한 방송 게임을 선택해주세요.",
  })
  games?: GameTitle[];
}

export class UpdateStreamerGamesDto {
  @IsArray()
  @ArrayNotEmpty({ message: "방송 게임을 하나 이상 선택해주세요." })
  @IsEnum(GameTitle, {
    each: true,
    message: "유효한 방송 게임을 선택해주세요.",
  })
  games!: GameTitle[];
}

export class StartStreamerOAuthDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(GameTitle, { each: true })
  games?: GameTitle[];
}
