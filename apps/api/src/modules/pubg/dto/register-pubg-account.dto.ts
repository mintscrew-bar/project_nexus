import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { PubgPlatform } from "@nexus/database";

export class RegisterPubgAccountDto {
  @IsEnum(PubgPlatform)
  platform: PubgPlatform;

  @IsString()
  @IsNotEmpty({ message: "PUBG 닉네임을 입력해주세요." })
  @MaxLength(50)
  playerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  playerId?: string;

  /** NEXUS 내전용 평가값. 공식 PUBG 랭크와 별개다. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  combatScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  iglScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  teamplayScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  consistencyScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  experienceScore?: number;
}
