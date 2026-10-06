// 유저 관리 탭이 공유하는 타입과 상수. UsersTab.tsx 에서 동작 변경 없이 옮겼다.

export type UserRole = "USER" | "MODERATOR" | "ADMIN";
export type UserPresence = "ONLINE" | "OFFLINE" | "AWAY";
export type UserKindFilter = "users" | "bots" | "all";
export type UserRoleFilter = "all" | UserRole;
export type UserStatusFilter =
  | "all"
  | "normal"
  | "banned"
  | "restricted"
  | "reported"
  | "streamer"
  | "no-riot";
export type UserPresenceFilter = "all" | "online" | "offline" | "away";
export type StreamerProfileSummary = {
  platform: "CHZZK" | "SOOP" | "YOUTUBE";
  channelUrl: string;
  channelName: string | null;
  isActive: boolean;
};
export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  isBot?: boolean;
  role: UserRole;
  status: UserPresence;
  lastSeenAt: string | null;
  isBanned: boolean;
  banReason: string | null;
  banUntil: string | null;
  isRestricted: boolean;
  restrictedUntil: string | null;
  createdAt: string;
  authProviders: { provider: string }[];
  riotAccounts: {
    id: string;
    gameName: string;
    tagLine: string;
    puuid?: string;
    tier: string;
    rank: string;
    isPrimary: boolean;
  }[];
  streamerProfiles?: StreamerProfileSummary[];
  _count: { reportsReceived: number };
}

export const ROLE_LABELS: Record<UserRole, string> = {
  USER: "일반",
  MODERATOR: "매니저",
  ADMIN: "관리자",
};
export const ROLE_VARIANTS: Record<
  UserRole,
  "default" | "primary" | "secondary" | "danger" | "gold"
> = {
  USER: "default",
  MODERATOR: "secondary",
  ADMIN: "danger",
};
export const USER_KIND_FILTERS: Array<{
  value: UserKindFilter;
  label: string;
}> = [
  { value: "users", label: "일반 유저" },
  { value: "bots", label: "테스트 봇" },
  { value: "all", label: "전체" },
];
export const USER_ROLE_FILTERS: Array<{
  value: UserRoleFilter;
  label: string;
}> = [
  { value: "all", label: "전체 권한" },
  { value: "USER", label: "일반" },
  { value: "MODERATOR", label: "매니저" },
  { value: "ADMIN", label: "관리자" },
];
export const USER_STATUS_FILTERS: Array<{
  value: UserStatusFilter;
  label: string;
}> = [
  { value: "all", label: "전체 상태" },
  { value: "normal", label: "정상" },
  { value: "banned", label: "밴" },
  { value: "restricted", label: "제재 중" },
  { value: "reported", label: "신고 있음" },
  { value: "streamer", label: "스트리머" },
  { value: "no-riot", label: "라이엇 미연동" },
];
export const USER_PRESENCE_FILTERS: Array<{
  value: UserPresenceFilter;
  label: string;
}> = [
  { value: "all", label: "전체 접속" },
  { value: "online", label: "온라인" },
  { value: "away", label: "자리비움" },
  { value: "offline", label: "오프라인" },
];
export const PRESENCE_LABELS: Record<UserPresence, string> = {
  ONLINE: "온라인",
  OFFLINE: "오프라인",
  AWAY: "자리비움",
};
export const PRESENCE_VARIANTS: Record<
  UserPresence,
  "default" | "primary" | "secondary" | "danger" | "gold"
> = {
  ONLINE: "primary",
  OFFLINE: "default",
  AWAY: "secondary",
};
