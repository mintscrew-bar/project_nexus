import { Injectable } from "@nestjs/common";
import type { PubgPlatform } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";

/** 정렬 전에 DB 에서 가져오는 후보 수. 정확히 일치하는 사람이 뒤로 밀려 잘리지 않게 넉넉히 가져온다. */
const CANDIDATE_LIMIT = 50;

export interface PubgPlayerSearchResult {
  userId: string;
  username: string;
  avatar: string | null;
  /** 대표 PUBG 계정. 본인이 게임 계정 공개를 껐으면 null */
  pubgAccount: {
    playerName: string;
    platform: PubgPlatform | null;
    pubgTier: string | null;
    nexusTier: string | null;
  } | null;
  /** 상대가 내전 전적을 공개하지 않는다. 결과엔 나오지만 기록은 못 연다 */
  historyHidden: boolean;
}

/** 검색어와 얼마나 가까운가. 작을수록 앞에 둔다 */
function matchRank(query: string, ...names: Array<string | null | undefined>) {
  const q = query.toLowerCase();
  let best = 3;
  for (const raw of names) {
    if (!raw) continue;
    const name = raw.toLowerCase();
    if (name === q) return 0;
    if (name.startsWith(q)) best = Math.min(best, 1);
    else if (name.includes(q)) best = Math.min(best, 2);
  }
  return best;
}

/**
 * 배그 내전 기록 검색.
 *
 * NEXUS 에 등록한 사람을 닉네임 또는 PUBG 닉네임으로 찾는다. PUBG API 를 부르지 않는다 —
 * 앱 전체가 10 req/분을 수집기·계정 등록과 나눠 쓰는데 공개 검색이 그 예산을 쓰면 안 된다.
 * 어차피 PUBG API 로는 남의 NEXUS 내전 기록을 찾을 수 없다(검색 대상은 이 사이트의 기록이다).
 *
 * 개인정보 설정을 지킨다:
 * - `showRiotAccounts` 를 끈 사람은 PUBG 닉네임으로는 찾히지 않고(닉네임으로 신원이 드러난다),
 *   결과에도 계정을 싣지 않는다. NEXUS 닉네임으로는 찾을 수 있다.
 * - `showMatchHistory` 를 끈 사람은 결과에 나오되 `historyHidden` 이다.
 */
@Injectable()
export class PubgSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchPlayers(
    query: string,
    limit = 10,
  ): Promise<PubgPlayerSearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const users = await this.prisma.user.findMany({
      where: {
        isBanned: false,
        // 배그 계정이 없는 사람은 배그 기록이 없다
        pubgAccounts: { some: {} },
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          {
            // PUBG 닉네임 일치는 게임 계정을 공개한 사람만. 설정 행이 없으면 기본값(공개).
            AND: [
              {
                pubgAccounts: {
                  some: { playerName: { contains: q, mode: "insensitive" } },
                },
              },
              { NOT: { settings: { is: { showRiotAccounts: false } } } },
            ],
          },
        ],
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        settings: {
          select: { showRiotAccounts: true, showMatchHistory: true },
        },
        pubgAccounts: {
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          select: {
            playerName: true,
            lastMatchShard: true,
            pubgTier: true,
            nexusTier: true,
            isPrimary: true,
          },
        },
      },
      take: CANDIDATE_LIMIT,
    });

    return users
      .map((user) => {
        const showAccounts = user.settings?.showRiotAccounts !== false;
        // 검색어와 가장 가까운 계정을 보여준다. 없으면 대표 계정.
        const matched =
          user.pubgAccounts.find((account) =>
            account.playerName.toLowerCase().includes(q.toLowerCase()),
          ) ?? user.pubgAccounts[0];
        return {
          rank: matchRank(
            q,
            user.username,
            showAccounts ? matched?.playerName : null,
          ),
          result: {
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            pubgAccount:
              showAccounts && matched
                ? {
                    playerName: matched.playerName,
                    platform: matched.lastMatchShard,
                    pubgTier: matched.pubgTier,
                    nexusTier: matched.nexusTier,
                  }
                : null,
            historyHidden: user.settings?.showMatchHistory === false,
          } satisfies PubgPlayerSearchResult,
        };
      })
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          a.result.username.localeCompare(b.result.username, "ko"),
      )
      .slice(0, limit)
      .map((entry) => entry.result);
  }
}
