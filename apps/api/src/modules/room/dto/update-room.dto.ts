import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Transform } from "class-transformer";
import { BracketType, TeamCaptainSelection, TeamMode } from "@nexus/database";
import { stripAllHtml } from "@/common/utils/sanitize";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/**
 * 방 설정 수정 DTO (PUT :id, 방장 전용) — 모든 필드 선택적.
 *
 * 컨트롤러가 `Partial<CreateRoomDto>` 를 받고 있었는데, `Partial<...>` 은 타입 별칭이라
 * 런타임에는 클래스가 아니다(메타데이터가 `Object`). 그래서 이 엔드포인트는 전역
 * ValidationPipe 의 검증도 허용 필드 걸러내기도 받지 않았고, 서비스가 일부 필드만
 * 따로 검사했다(이름 길이·팀 모드·열거값은 무검증). 범위는 `CreateRoomDto` 와 같다.
 *
 * 수정할 수 없는 항목(게임·배그 플랫폼/모드·예약 시각·디스코드 서버·방장 관전 여부)은
 * 일부러 뺐다 — 보내면 400 이다. 클라이언트(`RoomSettingsModal`)는 보내지 않는다.
 * 숫자·불리언은 `@KeepRaw()` 로 `"30"`, `"false"` 같은 문자열이 변환돼 통과하는 것을 막는다.
 */
export class UpdateRoomDto {
  /** 방 이름은 플레인 텍스트만 허용 (모든 HTML 태그 제거) */
  @IsOptional()
  @Transform(({ value }) => stripAllHtml(value))
  @IsString()
  @IsNotEmpty({ message: "방 이름을 입력해주세요." })
  @MaxLength(50, { message: "방 이름은 50자를 초과할 수 없습니다." })
  name?: string;

  /** 빈 문자열이나 null 은 비밀번호 해제다 (클라이언트가 공개 방으로 바꿀 때 null 을 보낸다) */
  @KeepRaw()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  password?: string | null;

  @KeepRaw()
  @IsOptional()
  @IsInt()
  // 실제 정원표 검증은 서비스가 게임·모드별로 한다. 여기서는 범위만 막는다.
  @Min(6, { message: "최소 6명 이상이어야 합니다." })
  @Max(100, { message: "정원이 너무 많습니다." })
  maxParticipants?: number;

  @IsOptional()
  @IsEnum(TeamMode, { message: "유효한 팀 모드를 선택해주세요." })
  teamMode?: TeamMode;

  @KeepRaw()
  @IsOptional()
  @IsBoolean()
  allowSpectators?: boolean;

  @KeepRaw()
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(360)
  killMatchDurationMinutes?: number;

  @KeepRaw()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  battleRoyaleRounds?: number;

  // ── Auction 설정 ──
  @KeepRaw()
  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  startingPoints?: number;

  @KeepRaw()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  minBidIncrement?: number;

  @KeepRaw()
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  bidTimeLimit?: number;

  // ── Snake Draft 설정 ──
  @KeepRaw()
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

  /** 다전제 프리셋 키. 팀 수마다 유효한 값이 달라 실제 검증은 서비스가 한다. */
  @KeepRaw()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  seriesPreset?: string;
}
