import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * 사용자 설정 수정 DTO
 */
export class UpdateSettingsDto {
  // ── 알림 설정 ──
  @IsOptional()
  @IsBoolean()
  notifyFriendRequest?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyFriendAccepted?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyMatchStart?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyMatchResult?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyTeamInvite?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyMention?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyComment?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyClanActivity?: boolean;

  @IsOptional()
  @IsBoolean()
  notifySystem?: boolean;

  // ── 공개 범위 설정 ──
  @IsOptional()
  @IsBoolean()
  showOnlineStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  showRiotAccounts?: boolean;

  @IsOptional()
  @IsBoolean()
  showChampionStats?: boolean;

  @IsOptional()
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
}
