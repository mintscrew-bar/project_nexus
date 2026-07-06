import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../auth/decorators/public.decorator";
import { BroadcastService, BroadcastScene } from "./broadcast.service";

/**
 * 방송 오버레이 공개 엔드포인트.
 * OBS 브라우저 소스는 로그인 불가 → 추측 불가 토큰으로만 인증(read-only).
 */
@Controller("broadcast")
export class BroadcastController {
  constructor(private readonly broadcastService: BroadcastService) {}

  @Get(":token/snapshot")
  @Public()
  async getSnapshot(
    @Param("token") token: string,
    @Query("scene") scene?: string,
    @Query("matchId") matchId?: string,
  ) {
    const validScenes: BroadcastScene[] = [
      "room",
      "match",
      "bracket",
      "result",
      "break",
    ];
    const resolvedScene = validScenes.includes(scene as BroadcastScene)
      ? (scene as BroadcastScene)
      : "room";
    return this.broadcastService.getSnapshot(token, resolvedScene, matchId);
  }
}
