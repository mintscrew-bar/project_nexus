import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsBoolean,
} from "class-validator";
import { Transform } from "class-transformer";
import { TeamMode, TeamCaptainSelection, BracketType } from "@nexus/database";
import { stripAllHtml } from "@/common/utils/sanitize";

/**
 * 내전방 생성 DTO
 */
export class CreateRoomDto {
  /** 방 이름은 플레인 텍스트만 허용 (모든 HTML 태그 제거) */
  @Transform(({ value }) => stripAllHtml(value))
  @IsString()
  @IsNotEmpty({ message: "방 이름을 입력해주세요." })
  @MaxLength(50, { message: "방 이름은 50자를 초과할 수 없습니다." })
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  password?: string;

  @IsInt()
  @Min(10, { message: "최소 10명 이상이어야 합니다." })
  @Max(40, { message: "최대 40명까지 가능합니다." })
  maxParticipants: number;

  @IsEnum(TeamMode, { message: "유효한 팀 모드를 선택해주세요." })
  teamMode: TeamMode;

  @IsOptional()
  @IsBoolean()
  allowSpectators?: boolean;

  @IsOptional()
  @IsString()
  discordGuildId?: string;

  // ── Auction 설정 ──
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  startingPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  minBidIncrement?: number;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  bidTimeLimit?: number;

  // ── Snake Draft 설정 ──
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  pickTimeLimit?: number;

  @IsOptional()
  @IsEnum(TeamCaptainSelection)
  captainSelection?: TeamCaptainSelection;

  // ── 토너먼트 설정 ──
  @IsOptional()
  @IsEnum(BracketType)
  bracketFormat?: BracketType;
}
