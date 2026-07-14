import { PrismaClient, Prisma } from "@prisma/client";

// 기존 auth_providers.metadata에 평문 저장된 OAuth accessToken/refreshToken을 제거하는 일회성 정리 스크립트.
// 저장된 토큰을 사용하는 코드가 없으므로 삭제해도 기능에 영향 없다.
// 실행: pnpm --filter @nexus/database db:scrub-oauth-tokens

const prisma = new PrismaClient();
const SENSITIVE_KEYS = ["accessToken", "refreshToken"];

async function main() {
  console.log("🔒 auth_providers.metadata OAuth 토큰 정리 시작...\n");

  const providers = await prisma.authProvider.findMany({
    select: { id: true, metadata: true },
  });

  let scrubbed = 0;

  for (const provider of providers) {
    const metadata = provider.metadata;
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      continue;
    }

    const record = metadata as Prisma.JsonObject;
    const foundKeys = SENSITIVE_KEYS.filter((key) => key in record);
    if (foundKeys.length === 0) {
      continue;
    }

    const cleaned: Prisma.JsonObject = { ...record };
    for (const key of foundKeys) {
      delete cleaned[key];
    }

    await prisma.authProvider.update({
      where: { id: provider.id },
      data: { metadata: cleaned },
    });
    scrubbed++;
  }

  console.log(
    `✅ 완료: 전체 ${providers.length}건 중 ${scrubbed}건에서 토큰 제거`,
  );
}

main()
  .catch((error) => {
    console.error("❌ 정리 실패:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
