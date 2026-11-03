import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { DiscordBotService } from "./discord-bot.service";

const DISCORD_AVATAR_PREFIX = "https://cdn.discordapp.com/avatars/";
/** 주소 확인을 동시에 몇 개씩 할지. 디스코드 CDN 에 몰아치지 않을 만큼만. */
const CHECK_CONCURRENCY = 5;
/** 부팅 직후 바로 돌지 않고 봇 로그인이 끝날 시간을 준다 */
const BOOT_DELAY_MS = 2 * 60 * 1000;

/** 디스코드 유저의 현재 아바타 해시로 CDN 주소를 만든다 (로그인 때와 같은 규칙) */
export function discordAvatarUrl(
  discordId: string,
  avatarHash: string | null,
): string | null {
  if (!avatarHash) return null;
  const ext = avatarHash.startsWith("a_") ? "gif" : "png";
  return `${DISCORD_AVATAR_PREFIX}${discordId}/${avatarHash}.${ext}`;
}

/**
 * 죽은 디스코드 아바타 주소를 새 주소로 바꾼다.
 *
 * 디스코드는 프로필 사진을 바꾸면 이전 CDN 해시를 지운다. 사이트는 가입·로그인
 * 때 받은 주소를 저장해 두고 쓰기 때문에, 사진을 바꾸고 다시 로그인하지 않은
 * 사람은 곳곳에서 이미지가 깨진다(2026-11-03 랭킹 28명 중 2명 404).
 * 재로그인 때 갱신하는 로직은 이미 있으나 로그인 유지 기간이 길어 그것만으론 부족하다.
 *
 * 하루 한 번(+부팅 직후 한 번) 저장된 디스코드 아바타 주소를 HEAD 로 확인하고,
 * 404 인 사람만 봇으로 현재 프로필을 받아 고친다. 사진을 지운 사람은 null 로
 * 비워 기본 이미지가 나오게 한다.
 */
@Injectable()
export class DiscordAvatarRefreshService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DiscordAvatarRefreshService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: DiscordBotService,
  ) {}

  onApplicationBootstrap() {
    // 테스트 환경에서는 타이머를 걸지 않는다
    if (process.env.NODE_ENV === "test") return;
    setTimeout(() => {
      this.refreshStaleAvatars().catch((error) =>
        this.logger.warn(`부팅 후 아바타 갱신 실패: ${error}`),
      );
    }, BOOT_DELAY_MS).unref();
  }

  @Cron("40 4 * * *")
  async scheduledRefresh(): Promise<void> {
    await this.refreshStaleAvatars();
  }

  /** @returns 고친 사람 수 */
  async refreshStaleAvatars(): Promise<number> {
    if (this.running) return 0;
    const client = this.botService.getClient();
    if (!client?.isReady()) {
      this.logger.debug("봇이 준비되지 않아 아바타 갱신을 건너뜀");
      return 0;
    }
    this.running = true;
    try {
      const users = await this.prisma.user.findMany({
        where: { avatar: { startsWith: DISCORD_AVATAR_PREFIX } },
        select: {
          id: true,
          avatar: true,
          authProviders: {
            where: { provider: "DISCORD" },
            select: { providerId: true },
            take: 1,
          },
        },
      });

      let fixed = 0;
      for (let i = 0; i < users.length; i += CHECK_CONCURRENCY) {
        const batch = users.slice(i, i + CHECK_CONCURRENCY);
        const results = await Promise.all(
          batch.map((user) => this.refreshOne(user)),
        );
        fixed += results.filter(Boolean).length;
      }
      if (fixed > 0) {
        this.logger.log(
          `죽은 디스코드 아바타 ${fixed}건 갱신 (확인 ${users.length}명)`,
        );
      }
      return fixed;
    } finally {
      this.running = false;
    }
  }

  private async refreshOne(user: {
    id: string;
    avatar: string | null;
    authProviders: { providerId: string }[];
  }): Promise<boolean> {
    if (!user.avatar) return false;
    // 연동 기록이 없으면 저장된 주소 안의 디스코드 ID 를 쓴다
    const discordId =
      user.authProviders[0]?.providerId ??
      user.avatar.slice(DISCORD_AVATAR_PREFIX.length).split("/")[0];
    if (!discordId) return false;

    try {
      const res = await fetch(user.avatar, {
        method: "HEAD",
        signal: AbortSignal.timeout(10_000),
      });
      // 404 만 죽은 것으로 본다. 5xx·타임아웃은 일시 장애일 수 있어 건드리지 않는다.
      if (res.status !== 404) return false;

      const discordUser = await this.botService
        .getClient()
        .users.fetch(discordId, { force: true });
      const next = discordAvatarUrl(discordId, discordUser.avatar);
      if (next === user.avatar) return false;

      await this.prisma.user.update({
        where: { id: user.id },
        data: { avatar: next },
      });
      return true;
    } catch (error) {
      this.logger.debug(`아바타 갱신 실패 ${user.id}: ${error}`);
      return false;
    }
  }
}
