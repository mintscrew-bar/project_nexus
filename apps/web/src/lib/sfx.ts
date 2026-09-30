import { useSfxStore } from "@/stores/sfx-store";

export const GAME_SFX = {
  bid: "/audio-review/freesound-cc0/bid_soft_select_653382.mp3",
  auctionTick: "/audio-review/freesound-cc0/switch_snap_842480.mp3",
  auctionClose: "/audio-review/freesound-cc0/auction_close_822568.mp3",
  hold: "/audio-review/mixkit-interface/mixkit_2577.mp3",
  drop: "/audio-review/freesound-cc0/card_drop_817539.mp3",
  rebalance: "/audio-review/freesound-cc0/rebalance_clean_108334.mp3",
} as const;

/**
 * 원본 파일마다 다른 체감 음량을 맞추는 사전 보정값.
 * 사용자 볼륨보다 먼저 적용되며, 1을 넘기지 않아 클리핑을 피한다.
 */
export const SFX_GAIN_BY_FILE: Record<string, number> = {
  "bid_soft_select_653382.mp3": 0.78,
  "auction_close_822568.mp3": 0.88,
  "mixkit_2577.mp3": 0.72,
  "card_drop_817539.mp3": 0.95,
  // 원본이 매우 작다(최대 -32dB). 0.62 로는 게임 중 줄인 배경음악에도 묻혀서
  // 보정 없이 최대로 둔다. 더 키우려면 파일 자체를 정규화해야 한다.
  "switch_snap_842480.mp3": 1,
  "rebalance_clean_108334.mp3": 0.68,
};

export function getSfxPlaybackVolume(source: string, gain = 1): number {
  const { enabled, volume } = useSfxStore.getState();
  if (!enabled || volume <= 0) return 0;

  const filename = source.split("/").pop() ?? source;
  const normalizedGain = SFX_GAIN_BY_FILE[filename] ?? 0.8;
  return Math.min(1, Math.max(0, volume * normalizedGain * gain));
}

export function playSfx(source: string, gain = 1): HTMLAudioElement | null {
  const volume = getSfxPlaybackVolume(source, gain);
  if (volume <= 0 || typeof Audio === "undefined") return null;

  const audio = new Audio(source);
  audio.volume = volume;
  void audio.play().catch(() => {
    // 브라우저 자동 재생 정책 등으로 막혀도 화면 동작은 계속되어야 한다.
  });
  return audio;
}
