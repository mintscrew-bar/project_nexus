export type UserSearchResult = {
  userId: string;
  username: string;
  avatar: string | null;
};

export type MatchQuickFillOption = {
  matchId: string;
  label: string;
  teamA: UserSearchResult[];
  teamB: UserSearchResult[];
};
