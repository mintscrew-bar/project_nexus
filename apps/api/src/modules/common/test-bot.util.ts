import { Prisma } from "@nexus/database";

/**
 * 부하·기능 테스트용 봇 계정을 가려낸다.
 *
 * 운영 DB에 실제로 들어와 있는 봇은 두 묶음이다(2026-09 실측 150계정).
 *   - `testbot_01#BOT` ~ `testbot_40#BOT`   — puuid 접두사 `loadtest_b...`
 *   - `concbot_001#BOT` ~ `concbot_110#BOT` — puuid 접두사 `concbot_pu...`
 * 둘 다 `tagLine = 'BOT'` 이라 이 조건 하나로 150개가 전부 덮인다. 나머지
 * 조건은 tagLine 을 안 붙이고 만든 봇이 생겼을 때를 위한 이중 안전망이다.
 *
 * 봇 puuid 는 진짜 PUUID(78자)가 아니라 17~21자라서 Riot match-v5 가 거부한다.
 * 그래서 봇은 라인 대결 표본에 한 행도 남기지 않는다(match_participants 0건).
 * 문제가 되는 건 집계 쪽이다 — 내전 테스트에 참여한 봇이 NexusRanking 에 쌓여
 * 리더보드 58행 중 19행을 차지하고 있었다.
 *
 * admin 화면과 랭킹 집계가 같은 기준을 써야 "관리자 화면에선 봇인데 리더보드엔
 * 올라와 있는" 불일치가 생기지 않으므로, 판별을 여기 한 곳에 둔다.
 */
export const TEST_BOT_USER_WHERE: Prisma.UserWhereInput = {
  OR: [
    {
      username: {
        startsWith: "testbot_",
        mode: "insensitive",
      },
    },
    {
      username: {
        startsWith: "concbot_",
        mode: "insensitive",
      },
    },
    // email은 nullable이고, 암호화 백필로 대부분의 유저가 null이다.
    // NULL에 LIKE를 걸면 결과가 false가 아니라 NULL(unknown)이 되고,
    // 이 조건이 `NOT: botWhere` 형태로 뒤집히면 NOT NULL도 NULL이라
    // 해당 행이 통째로 결과에서 탈락한다(= 일반 유저 목록/카운트가 0).
    // IS NOT NULL 가드로 NULL을 명시적으로 false로 떨어뜨린다.
    {
      AND: [
        { email: { not: null } },
        {
          email: {
            endsWith: "@nexus.test",
            mode: "insensitive",
          },
        },
      ],
    },
    {
      riotAccounts: {
        some: {
          OR: [
            { puuid: { startsWith: "bot_puuid_" } },
            { puuid: { startsWith: "loadtest_b" } },
            { puuid: { startsWith: "concbot_pu" } },
            { tagLine: { equals: "BOT", mode: "insensitive" } },
          ],
        },
      },
    },
  ],
};

/** 이미 읽어 둔 유저 객체로 판별한다(쿼리 없이). 조건은 위와 같게 유지할 것. */
export function isTestBotUser(user: {
  username?: string | null;
  email?: string | null;
  riotAccounts?: Array<{
    puuid?: string | null;
    tagLine?: string | null;
  }>;
}): boolean {
  const username = user.username?.toLowerCase();

  return (
    username?.startsWith("testbot_") ||
    username?.startsWith("concbot_") ||
    user.email?.toLowerCase().endsWith("@nexus.test") ||
    user.riotAccounts?.some(
      (account) =>
        account.puuid?.startsWith("bot_puuid_") ||
        account.puuid?.startsWith("loadtest_b") ||
        account.puuid?.startsWith("concbot_pu") ||
        account.tagLine?.toUpperCase() === "BOT",
    ) ||
    false
  );
}
