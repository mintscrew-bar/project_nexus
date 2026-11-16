import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/** POST medals/admin/adjust (ADMIN) — 관리자 지급(양수)·회수(음수) */
export class AdjustMedalDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  /** 한 번에 ±10,000 까지 — 실수로 자릿수를 더 쳐도 피해가 커지지 않게 */
  @KeepRaw()
  @IsInt({ message: "메달은 정수여야 합니다." })
  @NotEquals(0, { message: "0 메달은 조정할 수 없습니다." })
  @Min(-10000)
  @Max(10000)
  amount!: number;

  /** 사유 — 감사 로그와 원장에 남는다 */
  @IsString()
  @IsNotEmpty({ message: "조정 사유를 적어주세요." })
  @MaxLength(300)
  memo!: string;

  /** 관리자 화면이 요청마다 만든 고유값 — 두 번 눌러도 한 번만 반영된다 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  requestId!: string;
}

/** POST medals/admin/retro (ADMIN) — 기존 경기 소급 지급. dryRun 이면 세기만 한다 */
export class RetroMedalDto {
  @KeepRaw()
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

/** POST medals/admin/void-match (ADMIN) — 경기 무효 처리·회수 */
export class VoidMatchMedalDto {
  @IsString()
  @IsNotEmpty()
  matchId!: string;

  @IsString()
  @IsNotEmpty({ message: "무효 사유를 적어주세요." })
  @MaxLength(300)
  memo!: string;
}
