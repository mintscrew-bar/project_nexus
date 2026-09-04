import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * 운영자 편성 등급 보정.
 *
 * 자동 산정이 사람 눈에 명백히 틀린 경우를 위한 경로다.
 * 사유를 남기게 해서 "누가 왜 올렸는지"가 기록에 남는다.
 */
export class SetPubgTierDto {
  /** 1티어가 가장 높다. 자동 산정과 같은 눈금을 쓴다. */
  @IsIn(["1", "2", "3", "4", "5"])
  tier: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
