import { Injectable, Logger } from "@nestjs/common";
import { Guild, PermissionFlagsBits } from "discord.js";
import * as fs from "fs";
import * as path from "path";

/**
 * 모집 메시지에 쓰는 커스텀 이모지를 길드에 프로비저닝한다.
 *
 * 게이지·모드 아이콘을 유니코드 문자로 그리면 클라이언트 폰트 폴백에 따라
 * 두부(□)로 깨진다. 커스텀 이모지는 이미지라 어디서든 동일하게 렌더된다.
 *
 * 이모지 등록에는 ManageGuildExpressions 권한이 필요하고, 길드 이모지 슬롯도
 * 유한(기본 50개)하다. 따라서 실패는 정상 경로로 취급하고 호출부가 텍스트로
 * 폴백할 수 있도록 빈 맵을 돌려준다 — 모집 알림 자체가 막히면 안 된다.
 */

/** 등록할 이모지 이름 (assets/emoji/<name>.png 와 1:1) */
export const RECRUIT_EMOJI_NAMES = [
  "nx_pip_on",
  "nx_pip_off",
  "nx_mode_auction",
  "nx_mode_snake",
  "nx_mode_balance",
  "nx_mode_manual",
] as const;

export type RecruitEmojiName = (typeof RECRUIT_EMOJI_NAMES)[number];

/** 이모지 이름 → `<:name:id>` 멘션. 미등록 이름은 키 자체가 없다. */
export type EmojiMap = Partial<Record<RecruitEmojiName, string>>;

const ASSET_DIR = path.join(__dirname, "assets", "emoji");

@Injectable()
export class DiscordEmojiService {
  private readonly logger = new Logger(DiscordEmojiService.name);

  /** guildId → 해석된 이모지 맵 */
  private readonly cache = new Map<string, EmojiMap>();
  /** 동시 호출이 같은 이모지를 중복 생성하지 않도록 길드별 작업을 직렬화 */
  private readonly inFlight = new Map<string, Promise<EmojiMap>>();

  /**
   * 길드에 이모지가 없으면 만들고, 이름 → 멘션 문자열 맵을 돌려준다.
   * 권한이 없거나 슬롯이 꽉 찼으면 가능한 만큼만 담아 반환한다.
   */
  async ensureRecruitEmojis(guild: Guild): Promise<EmojiMap> {
    const cached = this.cache.get(guild.id);
    if (cached) return cached;

    const running = this.inFlight.get(guild.id);
    if (running) return running;

    const task = this.resolve(guild).finally(() => {
      this.inFlight.delete(guild.id);
    });
    this.inFlight.set(guild.id, task);
    return task;
  }

  /** 이모지를 다시 등록해야 할 때(수동 삭제 등) 캐시를 비운다 */
  invalidate(guildId: string): void {
    this.cache.delete(guildId);
  }

  private async resolve(guild: Guild): Promise<EmojiMap> {
    const map: EmojiMap = {};

    try {
      const existing = await guild.emojis.fetch();
      const byName = new Map(existing.map((e) => [e.name ?? "", e]));

      // 이미 있는 것부터 채운다. 권한이 없어도 여기까지는 동작한다.
      for (const name of RECRUIT_EMOJI_NAMES) {
        const found = byName.get(name);
        if (found) map[name] = `<:${found.name}:${found.id}>`;
      }

      const missing = RECRUIT_EMOJI_NAMES.filter((name) => !map[name]);
      if (missing.length === 0) {
        this.cache.set(guild.id, map);
        return map;
      }

      const canManage = guild.members.me?.permissions.has(
        PermissionFlagsBits.ManageGuildExpressions,
      );
      if (!canManage) {
        this.logger.warn(
          `[${guild.name}] ManageGuildExpressions 권한이 없어 커스텀 이모지 ${missing.length}개를 등록하지 못했습니다. 텍스트로 대체합니다.`,
        );
        this.cache.set(guild.id, map);
        return map;
      }

      for (const name of missing) {
        const file = path.join(ASSET_DIR, `${name}.png`);
        if (!fs.existsSync(file)) {
          this.logger.warn(`이모지 에셋 없음: ${file}`);
          continue;
        }
        try {
          const created = await guild.emojis.create({
            attachment: fs.readFileSync(file),
            name,
          });
          map[name] = `<:${created.name}:${created.id}>`;
        } catch (err: any) {
          // 슬롯 초과(30008/50035 등)는 흔한 실패라 경고만 남기고 넘어간다.
          this.logger.warn(
            `[${guild.name}] 이모지 ${name} 등록 실패: ${err?.message}`,
          );
        }
      }

      this.cache.set(guild.id, map);
      return map;
    } catch (err: any) {
      this.logger.warn(
        `[${guild.id}] 이모지 조회 실패: ${err?.message}. 텍스트로 대체합니다.`,
      );
      // 실패를 캐시하면 권한을 나중에 줘도 복구가 안 되므로 캐시하지 않는다.
      return {};
    }
  }
}
