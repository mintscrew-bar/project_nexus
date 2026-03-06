/**
 * 개발/테스트용 더미 데이터 시드 스크립트
 * 실행: cd packages/database && pnpm db:seed
 *
 * 생성 내용:
 *  - 테스트 유저 3명 (test1, test2, test3) + 비밀번호: test1234
 *  - test1 ↔ test2, test1 ↔ test3 친구 관계 (ACCEPTED)
 *  - 클랜 "넥서스 테스트단" 생성 (test1 오너, test2 멤버)
 *  - 각 유저 UserSettings 생성
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 시드 데이터 생성 시작...\n');

  // ─── 1. 기존 더미 데이터 정리 ─────────────────────────────────────
  // 이미 존재하는 경우 충돌 방지를 위해 먼저 삭제
  const existingEmails = ['test1@nexus.dev', 'test2@nexus.dev', 'test3@nexus.dev'];
  const existingUsers = await prisma.user.findMany({
    where: { email: { in: existingEmails } },
    select: { id: true },
  });
  const existingIds = existingUsers.map((u) => u.id);

  if (existingIds.length > 0) {
    // 친구 관계 삭제
    await prisma.friendship.deleteMany({
      where: { OR: [{ userId: { in: existingIds } }, { friendId: { in: existingIds } }] },
    });
    // 클랜 멤버 삭제
    await prisma.clanMember.deleteMany({ where: { userId: { in: existingIds } } });
    // 클랜 소유자가 테스트 유저인 클랜 삭제
    await prisma.clan.deleteMany({ where: { ownerId: { in: existingIds } } });
    // 유저 삭제 (Cascade로 settings 등도 같이 삭제됨)
    await prisma.user.deleteMany({ where: { id: { in: existingIds } } });
    console.log('♻️  기존 더미 데이터 정리 완료');
  }

  // ─── 2. 비밀번호 해시 ─────────────────────────────────────────────
  // "test1234"를 bcrypt로 해시한 값 (salt rounds: 10)
  const passwordHash = '$2b$10$vuQmtGHsSVr/Okjne3D4Eu/aCJoW9z5lqL8Ea5syXUy0GNChgvHV2';

  // ─── 3. 유저 생성 ─────────────────────────────────────────────────
  const [user1, user2, user3] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'test1@nexus.dev',
        password: passwordHash,
        username: '테스터원',
        status: 'ONLINE',
        authProviders: {
          create: { provider: 'EMAIL', providerId: 'test1@nexus.dev' },
        },
        settings: { create: {} },
      },
    }),
    prisma.user.create({
      data: {
        email: 'test2@nexus.dev',
        password: passwordHash,
        username: '테스터투',
        status: 'ONLINE',
        authProviders: {
          create: { provider: 'EMAIL', providerId: 'test2@nexus.dev' },
        },
        settings: { create: {} },
      },
    }),
    prisma.user.create({
      data: {
        email: 'test3@nexus.dev',
        password: passwordHash,
        username: '테스터쓰리',
        status: 'AWAY',
        authProviders: {
          create: { provider: 'EMAIL', providerId: 'test3@nexus.dev' },
        },
        settings: { create: {} },
      },
    }),
  ]);

  console.log(`✅ 유저 생성: ${user1.username}, ${user2.username}, ${user3.username}`);

  // ─── 4. 친구 관계 생성 (양방향) ───────────────────────────────────
  // Friendship은 단방향 레코드이므로 양쪽 모두 생성
  await prisma.friendship.createMany({
    data: [
      // test1 ↔ test2
      { userId: user1.id, friendId: user2.id, status: 'ACCEPTED' },
      { userId: user2.id, friendId: user1.id, status: 'ACCEPTED' },
      // test1 ↔ test3
      { userId: user1.id, friendId: user3.id, status: 'ACCEPTED' },
      { userId: user3.id, friendId: user1.id, status: 'ACCEPTED' },
    ],
  });

  console.log('✅ 친구 관계 생성: test1↔test2, test1↔test3');

  // ─── 5. 클랜 생성 ─────────────────────────────────────────────────
  const clan = await prisma.clan.create({
    data: {
      name: '넥서스 테스트단',
      tag: 'TEST',
      description: '개발 테스트용 클랜입니다.',
      ownerId: user1.id,
      isRecruiting: true,
      members: {
        createMany: {
          data: [
            { userId: user1.id, role: 'OWNER' },
            { userId: user2.id, role: 'MEMBER' },
          ],
        },
      },
    },
  });

  console.log(`✅ 클랜 생성: [${clan.tag}] ${clan.name} (오너: ${user1.username}, 멤버: ${user2.username})`);

  // ─── 6. mangovehicle 계정 ↔ test1 친구 관계 추가 ─────────────────
  const mangoUser = await prisma.user.findFirst({
    where: { email: 'mangovehicle21@gmail.com' },
    select: { id: true, username: true },
  });

  if (mangoUser) {
    // 기존 친구 관계 있으면 삭제 후 재생성
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId: mangoUser.id, friendId: { in: [user1.id, user2.id, user3.id] } },
          { friendId: mangoUser.id, userId: { in: [user1.id, user2.id, user3.id] } },
        ],
      },
    });
    await prisma.friendship.createMany({
      data: [
        { userId: mangoUser.id, friendId: user1.id, status: 'ACCEPTED' },
        { userId: user1.id,     friendId: mangoUser.id, status: 'ACCEPTED' },
        { userId: mangoUser.id, friendId: user2.id, status: 'ACCEPTED' },
        { userId: user2.id,     friendId: mangoUser.id, status: 'ACCEPTED' },
        { userId: mangoUser.id, friendId: user3.id, status: 'ACCEPTED' },
        { userId: user3.id,     friendId: mangoUser.id, status: 'ACCEPTED' },
      ],
    });
    // mangovehicle도 클랜에 추가
    await prisma.clanMember.upsert({
      where: { clanId_userId: { clanId: clan.id, userId: mangoUser.id } },
      update: {},
      create: { clanId: clan.id, userId: mangoUser.id, role: 'MEMBER' },
    });
    console.log(`✅ ${mangoUser.username} ↔ test1/test2/test3 친구 + 클랜 추가`);
  } else {
    console.log('⚠️  mangovehicle21 계정을 찾지 못했습니다. (건너뜀)');
  }

  // ─── 완료 ────────────────────────────────────────────────────────
  console.log('\n🎉 시드 완료!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('로그인 정보:');
  console.log('  이메일: test1@nexus.dev  비밀번호: test1234  (클랜 오너)');
  console.log('  이메일: test2@nexus.dev  비밀번호: test1234  (클랜 멤버, test1 친구)');
  console.log('  이메일: test3@nexus.dev  비밀번호: test1234  (test1 친구, 클랜 없음)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ 시드 실패:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
