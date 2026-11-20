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
  IsIn,
} from "class-validator";
import { MedalReason } from "@nexus/database";
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
  /** 잔액보다 큰 회수를 허용 — 기본은 막는다(Task 17). 부정 획득 회수처럼 마이너스 잔액이 맞을 때만 */
  @KeepRaw()
  @IsOptional()
  @IsBoolean()
  allowNegative?: boolean;
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

/** POST medals/admin/refund (ADMIN) — 상점 구매 환불 */
export class RefundCosmeticDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  itemCode!: string;

  /** 사유 — 감사 로그와 원장에 남는다 */
  @IsString()
  @IsNotEmpty({ message: "환불 사유를 적어주세요." })
  @MaxLength(300)
  memo!: string;
}

/** GET medals/admin/ledger (ADMIN) — 원장 조회 필터 */
export class AdminLedgerQueryDto {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsIn(Object.values(MedalReason))
  reason?: MedalReason;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

/**
 * POST medals/admin/campaign(/preview) (ADMIN) — 가입자 전체 일괄 지급.
 * 받는 양 = base + perMatch × min(완주 경기 수, matchCap). 서비스가 범위를 다시 검사한다.
 */
export class MedalCampaignDto {
  @IsString()
  @IsNotEmpty({ message: "이름표를 적어주세요." })
  @MaxLength(40)
  key!: string;

  @IsString()
  @IsNotEmpty({ message: "받는 사람에게 보일 제목을 적어주세요." })
  @MaxLength(60)
  title!: string;

  @KeepRaw()
  @IsInt()
  @Min(0)
  @Max(10000)
  base!: number;

  @KeepRaw()
  @IsInt()
  @Min(0)
  @Max(1000)
  perMatch!: number;

  @KeepRaw()
  @IsInt()
  @Min(0)
  @Max(1000)
  matchCap!: number;

  @KeepRaw()
  @IsBoolean()
  notify!: boolean;
}
