/**
 * 사이트 배경음악 플레이리스트.
 *
 * 롤·배그 공용 하나다. 곡 파일은 `apps/web/public/audio/bgm/` 에 두고
 * 여기 목록에 한 줄씩 추가한다. 목록이 비어 있으면 플레이어와 음소거 버튼이
 * 통째로 숨는다 — 곡이 준비되기 전에 배포돼도 화면에 빈 버튼이 뜨지 않는다.
 *
 * 형식은 mp3 를 쓴다. ogg 는 구형 사파리에서 재생되지 않는다.
 */
export interface BgmTrack {
  /** 같은 곡 연속 재생을 막을 때 비교하는 값. 파일명과 같게 둔다. */
  id: string;
  /** 재생목록 패널에 보이는 이름 */
  title: string;
  /** public 기준 경로 */
  src: string;
  /**
   * 방장이 로비에서 게임을 시작하는 순간 전환할 곡 후보.
   * 하나도 표시하지 않으면 전체 곡 중에서 지금 곡이 아닌 곡으로 넘어간다.
   */
  hype?: boolean;
}

export const BGM_TRACKS: BgmTrack[] = [
  // 어두운 패드 위로 베이스가 박동하며 긴장을 쌓는 곡
  {
    id: "pulsing-tension",
    title: "Pulsing Tension",
    src: "/audio/bgm/pulsing-tension.mp3",
  },
  // 디튠된 업라이트 피아노 모티프 중심의 가라앉은 곡
  {
    id: "detuned-focus",
    title: "Detuned Focus",
    src: "/audio/bgm/detuned-focus.mp3",
  },
  // 게임 시작 순간용 곡은 `hype: true` 를 붙인다. 예:
  // { id: "hype-01", title: "게임 시작", src: "/audio/bgm/hype-01.mp3", hype: true },
];

/**
 * 사용자 볼륨 100% 일 때의 실제 재생 볼륨(0~1).
 *
 * 수노 곡은 마스터링이 크게 나와서 최대치도 낮게 잡는다. 효과음·디스코드
 * 음성채팅 아래에 깔리는 소리여야 한다. 사용자 볼륨은 이 값에 곱해진다.
 */
export const BGM_MAX_VOLUME = 0.5;

/**
 * 사용자 볼륨 기본값(0~1).
 *
 * 0.4 × 최대 0.5 = 0.2 로, 볼륨 조절이 생기기 전의 고정 볼륨과 같다.
 * 처음 온 사람에게는 예전과 똑같이 들린다.
 */
export const BGM_DEFAULT_USER_VOLUME = 0.4;

/**
 * 방 게임이 진행되는 동안 곱하는 비율.
 *
 * 경매 카운트다운·입찰·편성 효과음이 음악에 묻히지 않게 줄인다.
 * 2026-09 측정 기준, 카운트다운 틱 원본이 매우 작아(최대 -32dB) 0.2 로 틀면
 * 음악 평균보다 8dB 가까이 작게 들렸다. 0.2 → 0.07(약 -9dB)로 내리던 것을
 * 비율로 옮긴 값이라, 사용자가 볼륨을 바꿔도 줄어드는 폭은 같다.
 */
export const BGM_DUCK_RATIO = 0.35;

/** 재생목록 순서대로 앞·뒤 곡. 끝에서는 반대쪽 끝으로 돈다. */
export function stepTrack(
  tracks: readonly BgmTrack[],
  currentId: string | null,
  step: 1 | -1,
): BgmTrack | null {
  if (tracks.length === 0) return null;
  const index = tracks.findIndex((t) => t.id === currentId);
  if (index === -1) return tracks[0];
  return tracks[(index + step + tracks.length) % tracks.length];
}

/**
 * 다음 곡 고르기.
 *
 * 방금 튼 곡은 후보에서 뺀다 — 곡이 4~5개뿐이라 순수 랜덤이면 같은 곡이
 * 연달아 나오는 일이 잦다. 곡이 하나뿐이면 그 곡을 다시 튼다.
 */
export function pickNextTrack(
  tracks: readonly BgmTrack[],
  currentId: string | null,
  options?: { hype?: boolean },
): BgmTrack | null {
  if (tracks.length === 0) return null;

  // 게임 시작 전환이면 hype 곡 중에서 고른다. 표시된 곡이 없으면 전체에서.
  const hypeTracks = options?.hype ? tracks.filter((t) => t.hype) : [];
  const pool = hypeTracks.length > 0 ? hypeTracks : tracks;

  const candidates = pool.filter((t) => t.id !== currentId);
  const from = candidates.length > 0 ? candidates : pool;
  return from[Math.floor(Math.random() * from.length)];
}
