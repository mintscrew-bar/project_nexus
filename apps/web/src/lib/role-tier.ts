export interface RoleTier {
  role: string;
  tier: string;
  rank?: string;
  lp?: number;
}

export function getRoleTier(
  riotAccount: { roleTiers?: RoleTier[] } | null | undefined,
  role: string | null | undefined,
): RoleTier | null {
  if (!role) return null;
  return riotAccount?.roleTiers?.find((entry) => entry.role === role) ?? null;
}
