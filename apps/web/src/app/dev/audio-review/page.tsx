"use client";

import { useRef, useState } from "react";
import { useSfxStore } from "@/stores/sfx-store";
import { getSfxPlaybackVolume, playSfx } from "@/lib/sfx";

type SoundGroup = {
  title: string;
  description: string;
  items: Array<{ name: string; file: string; use: string }>;
};

const groups: SoundGroup[] = [
  {
    title: "입찰 · 선택",
    description: "입찰이 곧 최고 입찰자 변경이므로 입찰음 하나만 사용",
    items: [
      {
        name: "A · 기존 Bid Select",
        file: "../mixkit-interface/mixkit_2573.mp3",
        use: "입찰 후보",
      },
      {
        name: "B · Menu Selection",
        file: "bid_menu_select_171697.mp3",
        use: "입찰 후보",
      },
      {
        name: "C · Soft Select · 선택",
        file: "bid_soft_select_653382.mp3",
        use: "입찰·최고 입찰자 변경",
      },
      {
        name: "D · Metallic Select",
        file: "bid_metal_select_829014.mp3",
        use: "입찰 후보",
      },
      {
        name: "E · Button Click",
        file: "bid_button_click_677861.mp3",
        use: "입찰 후보",
      },
      {
        name: "Elegant Confirmation",
        file: "auction_close_822568.mp3",
        use: "입찰 마감·낙찰 확정",
      },
    ],
  },
  {
    title: "오토 밸런싱",
    description: "홀드와 놓기·교체 완료에만 재생하고 이동 중에는 무음",
    items: [
      {
        name: "Hold Lock",
        file: "../mixkit-interface/mixkit_2577.mp3",
        use: "홀드 시작·락온",
      },
      {
        name: "Card Drop",
        file: "card_drop_817539.mp3",
        use: "카드 놓기·팀 교체 완료",
      },
    ],
  },
  {
    title: "5초 카운트다운 · 재편성",
    description:
      "입찰이 들어오면 5초로 리셋하고, 재편성은 짧고 깨끗한 전환음 사용",
    items: [
      {
        name: "Countdown Snap",
        file: "switch_snap_842480.mp3",
        use: "5·4·3·2·1 펄스",
      },
      {
        name: "Clean Rebalance",
        file: "rebalance_clean_108334.mp3",
        use: "재편성 실행",
      },
    ],
  },
];

const AUDIO_BASE = "/audio-review/freesound-cc0/";
const bidCandidates = [
  { label: "A · 기존", file: "../mixkit-interface/mixkit_2573.mp3" },
  { label: "B · 메뉴 선택", file: "bid_menu_select_171697.mp3" },
  { label: "C · 소프트", file: "bid_soft_select_653382.mp3" },
  { label: "D · 메탈", file: "bid_metal_select_829014.mp3" },
  { label: "E · 클릭", file: "bid_button_click_677861.mp3" },
];
const wait = (ms: number) =>
  new Promise((resolve) => window.setTimeout(resolve, ms));

export default function AudioReviewPage() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string | null>(null);
  const [scenarioStep, setScenarioStep] = useState("대기 중");
  const [bidSound, setBidSound] = useState(bidCandidates[2].file);
  const sfxEnabled = useSfxStore((state) => state.enabled);
  const sfxVolume = useSfxStore((state) => state.volume);
  const setSfxEnabled = useSfxStore((state) => state.setEnabled);
  const setSfxVolume = useSfxStore((state) => state.setVolume);
  const runId = useRef(0);
  const activeAudio = useRef<HTMLAudioElement[]>([]);

  const stopScenario = () => {
    runId.current += 1;
    activeAudio.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    activeAudio.current = [];
    setScenario(null);
    setScenarioStep("대기 중");
  };

  const playClip = (file: string, volume = 0.72) => {
    const audio = playSfx(`${AUDIO_BASE}${file}`, volume);
    if (!audio) return null;
    activeAudio.current.push(audio);
    return audio;
  };

  const count = async (id: number, values: number[]) => {
    for (const value of values) {
      if (runId.current !== id) return false;
      setScenarioStep(`${value}`);
      playClip("switch_snap_842480.mp3", value <= 2 ? 1 : 0.85);
      await wait(900);
    }
    return runId.current === id;
  };

  const runAuctionCountdown = async (interrupted: boolean) => {
    stopScenario();
    const id = runId.current;
    setScenario(interrupted ? "입찰 발생으로 카운트 리셋" : "일반 입찰 마감");
    if (interrupted) {
      if (!(await count(id, [5, 4]))) return;
      setScenarioStep("새 입찰 · 5초로 리셋");
      playClip(bidSound);
      await wait(1200);
    }
    if (!(await count(id, [5, 4, 3, 2, 1]))) return;
    setScenarioStep("입찰 마감");
    playClip("auction_close_822568.mp3");
    await wait(900);
    if (runId.current === id) setScenario(null);
  };

  const runRebalance = async () => {
    stopScenario();
    const id = runId.current;
    setScenario("팀 재편성");
    setScenarioStep("팀 다시 섞는 중");
    playClip("rebalance_clean_108334.mp3");
    await wait(900);
    if (runId.current !== id) return;
    setScenarioStep("편성 완료");
    await wait(600);
    if (runId.current === id) setScenario(null);
  };

  const runSwap = async () => {
    stopScenario();
    const id = runId.current;
    setScenario("오토 밸런싱 교체");
    setScenarioStep("플레이어 홀드");
    playClip("../mixkit-interface/mixkit_2577.mp3");
    await wait(520);
    if (runId.current !== id) return;
    setScenarioStep("카드 이동 중 · 무음");
    await wait(900);
    if (runId.current !== id) return;
    setScenarioStep("놓기 · 교체 완료");
    playClip("card_drop_817539.mp3");
    await wait(700);
    if (runId.current === id) setScenario(null);
  };

  return (
    <main className="min-h-screen bg-[#0b0c10] px-5 py-10 text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 max-w-2xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-violet-300">
            NEXUS · AUDIO REVIEW
          </p>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
            게임 흐름에 붙여볼 효과음
          </h1>
          <p className="mt-4 text-sm leading-7 text-white/60 sm:text-base">
            실제 적용 전 후보를 사용처별로 들어보는 페이지입니다. 같은 계열
            안에서 버튼음은 작게, 상태 변화와 확정음은 조금 더 크게 쓰는
            기준으로 골랐습니다.
          </p>
          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setSfxEnabled(!sfxEnabled)}
              className={
                sfxEnabled
                  ? "rounded-lg bg-violet-300 px-4 py-2 text-sm font-bold text-black"
                  : "rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white/55"
              }
            >
              효과음 {sfxEnabled ? "켜짐" : "꺼짐"}
            </button>
            <label
              className={`flex flex-1 items-center gap-3 ${sfxEnabled ? "" : "opacity-40"}`}
            >
              <span className="shrink-0 text-xs font-semibold text-white/50">
                크기
              </span>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(sfxVolume * 100)}
                disabled={!sfxEnabled}
                onChange={(event) =>
                  setSfxVolume(Number(event.target.value) / 100)
                }
                className="w-full accent-violet-300"
              />
              <span className="w-10 text-right text-xs font-bold text-white/65">
                {Math.round(sfxVolume * 100)}%
              </span>
            </label>
          </div>
        </header>

        <section className="mb-8 rounded-3xl border border-violet-400/20 bg-violet-400/[0.06] p-5 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-300">
                상황 재생
              </p>
              <h2 className="mt-2 text-xl font-bold">실제 흐름으로 들어보기</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
                입찰이 들어오면 카운트가 즉시 5초로 돌아갑니다. 개별 효과음이
                아니라 버튼 입력부터 결과 공개까지 이어지는 전체 흐름을
                확인하세요.
              </p>
            </div>
            <div className="min-w-44 rounded-2xl border border-white/10 bg-black/25 px-5 py-4 text-center">
              <p className="text-xs text-white/40">{scenario ?? "현재 상황"}</p>
              <p className="mt-1 text-lg font-black text-violet-200">
                {scenarioStep}
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              onClick={() => void runAuctionCountdown(false)}
              className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-black"
            >
              일반 5초 마감
            </button>
            <button
              onClick={() => void runAuctionCountdown(true)}
              className="rounded-xl border border-violet-300/30 bg-violet-300/10 px-4 py-3 text-sm font-bold text-violet-100"
            >
              4초에서 새 입찰
            </button>
            <button
              onClick={() => void runRebalance()}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold"
            >
              팀 재편성
            </button>
            <button
              onClick={() => void runSwap()}
              className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold"
            >
              홀드 · 이동 · 놓기
            </button>
          </div>
          <div className="mt-5 border-t border-white/10 pt-4">
            <p className="mb-3 text-xs font-semibold text-white/45">
              새 입찰음 선택 · 선택한 소리가 ‘4초에서 새 입찰’ 상황에 적용됩니다
            </p>
            <div className="flex flex-wrap gap-2">
              {bidCandidates.map((candidate) => (
                <button
                  key={candidate.file}
                  onClick={() => {
                    setBidSound(candidate.file);
                    playClip(candidate.file);
                  }}
                  className={
                    bidSound === candidate.file
                      ? "rounded-full bg-violet-300 px-3 py-2 text-xs font-bold text-black"
                      : "rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-semibold text-white/60"
                  }
                >
                  {candidate.label}
                </button>
              ))}
            </div>
          </div>
          {scenario && (
            <button
              onClick={stopScenario}
              className="mt-4 text-xs font-semibold text-white/45 underline underline-offset-4"
            >
              재생 중지
            </button>
          )}
        </section>

        <div className="space-y-8">
          {groups.map((group) => (
            <section
              key={group.title}
              className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 sm:p-7"
            >
              <div className="mb-5">
                <h2 className="text-xl font-bold">{group.title}</h2>
                <p className="mt-1 text-sm text-white/45">
                  {group.description}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {group.items.map((item) => {
                  const id = `${group.title}-${item.file}`;
                  const source = `${AUDIO_BASE}${item.file}`;
                  return (
                    <article
                      key={id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{item.name}</h3>
                          <p className="mt-1 text-xs text-violet-200/70">
                            {item.use}
                          </p>
                        </div>
                        <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-white/45">
                          후보
                        </span>
                      </div>
                      <audio
                        className="mt-4 w-full"
                        controls
                        preload="none"
                        muted={!sfxEnabled}
                        src={source}
                        onPlay={(event) => {
                          event.currentTarget.volume =
                            getSfxPlaybackVolume(source);
                          setPlaying(id);
                        }}
                        onPause={() => setPlaying(null)}
                        onEnded={() => setPlaying(null)}
                      />
                      <p className="mt-3 truncate font-mono text-[10px] text-white/25">
                        {item.file}
                      </p>
                      {playing === id && (
                        <p className="mt-2 text-[11px] text-emerald-300">
                          재생 중
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-white/10 pt-5 text-xs leading-6 text-white/40">
          출처: Freesound CC0 원본 프리뷰. 각 상황의 의미와 전체 흐름을 먼저
          검수한 뒤, 선택된 사운드만 최종 음량과 길이를 다듬어 연결합니다.
        </footer>
      </div>
    </main>
  );
}
