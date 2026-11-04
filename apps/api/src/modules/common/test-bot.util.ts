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

/**
 * 봇이 한 명이라도 로스터에 들어간 판.
 *
 * 관리자가 봇을 채워 넣고 기능 시험을 한 판(예: 관리자 + testbot 9명)은 실제
 * 내전이 아니다. 그런데 봇이 아닌 참가자(관리자)의 랭킹·전적에는 그대로 쌓여
 * 리더보드와 전적 화면을 오염시켰다(2026-11-04 운영자 요청으로 제외).
 *
 * 로스터 스냅샷 기준으로 본다 — 봇은 Riot 수집 행(match_participants)을 남기지
 * 않으므로 참가자 테이블로는 봇 판을 가려낼 수 없다. 봇 계정이 지워져 userId 가
 * 비어도 걸리도록 스냅샷 닉네임도 함께 본다.
 */
export const TEST_BOT_MATCH_WHERE: Prisma.MatchWhereInput = {
  rosterSnapshots: {
    some: {
      OR: [
        { user: TEST_BOT_USER_WHERE },
        { username: { startsWith: "testbot_", mode: "insensitive" } },
        { username: { startsWith: "concbot_", mode: "insensitive" } },
      ],
    },
  },
};

/** 봇이 끼지 않은 판만 — 랭킹·전적 집계의 match 조건에 펼쳐 넣는다 */
export const NO_TEST_BOT_MATCH_WHERE: Prisma.MatchWhereInput = {
  NOT: TEST_BOT_MATCH_WHERE,
};

/**
 * 원시 SQL 집계용 같은 조건. `m` 이 matches 별칭이어야 한다.
 * 조건은 TEST_BOT_USER_WHERE·TEST_BOT_MATCH_WHERE 와 같게 유지할 것.
 */
export const NO_TEST_BOT_MATCH_SQL = Prisma.sql`
  AND NOT EXISTS (
    SELECT 1
    FROM "match_roster_snapshots" rs
    LEFT JOIN "users" u ON u."id" = rs."userId"
    WHERE rs."matchId" = m."id"
      AND (
        rs."username" ILIKE 'testbot\\_%'
        OR rs."username" ILIKE 'concbot\\_%'
        OR u."username" ILIKE 'testbot\\_%'
        OR u."username" ILIKE 'concbot\\_%'
        OR (u."email" IS NOT NULL AND u."email" ILIKE '%@nexus.test')
        OR EXISTS (
          SELECT 1
          FROM "riot_accounts" ra
          WHERE ra."userId" = u."id"
            AND (
              ra."puuid" LIKE 'bot\\_puuid\\_%'
              OR ra."puuid" LIKE 'loadtest\\_b%'
              OR ra."puuid" LIKE 'concbot\\_pu%'
              OR UPPER(ra."tagLine") = 'BOT'
            )
        )
      )
  )
`;
