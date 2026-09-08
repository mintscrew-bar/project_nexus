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
  IsISO8601,
} from "class-validator";
import { Transform } from "class-transformer";
import {
  TeamMode,
  TeamCaptainSelection,
  BracketType,
  GameTitle,
  PubgGameMode,
  PubgPlatform,
} from "@nexus/database";
import { stripAllHtml } from "@/common/utils/sanitize";

/**
 * 내전방 생성 DTO
 */
export class CreateRoomDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  battleRoyaleRounds?: number;
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(360)
  killMatchDurationMinutes?: number;
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

  /**
   * 어떤 게임의 내전인지. 생략하면 롤이다.
   * 정원·팀 수·고를 수 있는 팀 편성 방식이 이 값에 따라 갈린다.
   */
  @IsOptional()
  @IsEnum(GameTitle, { message: "지원하지 않는 게임입니다." })
  gameTitle?: GameTitle;

  /** 배그 방에서만 쓰인다. 이번 경기를 스팀에서 하는지 카카오에서 하는지. */
  @IsOptional()
  @IsEnum(PubgPlatform)
  pubgPlatform?: PubgPlatform;

  /** 배그 방에서만 쓰인다. 정원·팀 편성 선택지·결과 처리가 여기서 갈린다. */
  @IsOptional()
  @IsEnum(PubgGameMode)
  pubgGameMode?: PubgGameMode;

  @IsInt()
  // 게임·모드마다 정원이 다르다. 실제 검증은 정원표(`isValidRoomSize` /
  // `isValidPubgRoomSize`)가 하고 여기서는 범위만 막는다.
  // 가장 작은 방은 배그 킬내기 3대3(6명), 가장 큰 방은 배틀로얄 100명이다.
  @Min(6, { message: "최소 6명 이상이어야 합니다." })
  // 인게임 커스텀 매치 정원 한계가 100명이다. 실제 검증은 게임·모드별
  // 정원표가 하고, 여기서는 상한만 막는다.
  @Max(100, { message: "정원이 너무 많습니다." })
  maxParticipants: number;

  @IsEnum(TeamMode, { message: "유효한 팀 모드를 선택해주세요." })
  teamMode: TeamMode;

  @IsOptional()
  @IsBoolean()
  allowSpectators?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  discordGuildId?: string;

  /**
   * 예고제: 내전 예정 시각(ISO 8601).
   * 없으면 지금 바로 여는 방이다. 과거 시각·너무 먼 미래는 room.service에서 거른다.
   */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

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

  /**
   * 다전제 프리셋 키. 팀 수마다 고를 수 있는 값이 다르므로
   * 실제 유효성은 maxParticipants와 함께 room.service에서 검증한다.
   */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  seriesPreset?: string;
}
