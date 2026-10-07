import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/**
 * 사용자 설정 수정 DTO
 */
export class UpdateSettingsDto {
  // ── 알림 설정 ──
  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  notifyFriendRequest?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  notifyFriendAccepted?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  notifyMatchStart?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  notifyMatchResult?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  notifyTeamInvite?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  notifyMention?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  notifyComment?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  notifyClanActivity?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  notifySystem?: boolean;

  // ── 공개 범위 설정 ──
  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  showOnlineStatus?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  showRiotAccounts?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  showChampionStats?: boolean;

  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  allowFriendRequests?: boolean;

  // ── 프로필 하이라이트 ──
  @IsOptional()
  @IsString()
  highlightChampionId?: string | null;

  @IsOptional()
  @IsString()
  highlightStatType?: string | null;

  // ── 외관 설정 ──
  @IsOptional()
  @IsString()
  @MaxLength(20)
  theme?: string;

  // ── 온보딩 ──
  // 클라이언트는 "봤다"는 사실만 보내고, 시각은 서버가 기록한다.
  @IsOptional()
  @KeepRaw()
  @IsBoolean()
  onboardingSeen?: boolean;
}
