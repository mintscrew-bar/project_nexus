"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const OPTIONS = [
  { name: "양옆 셔터", detail: "양쪽에서 닫힌 뒤 새 화면을 공개합니다." },
  { name: "사선 스윕", detail: "굵은 사선 띠가 화면을 쓸고 지나갑니다." },
  { name: "중앙 펼침", detail: "가운데로 압축했다가 새 화면을 펼칩니다." },
];

const CSS = `
@keyframes tx-left { 0%, 100% { transform: translateX(-102%); } 38%, 62% { transform: translateX(0); } }
@keyframes tx-right { 0%, 100% { transform: translateX(102%); } 38%, 62% { transform: translateX(0); } }
@keyframes tx-diagonal { 0% { transform: translateX(-130%) skewX(-16deg); } 45%, 55% { transform: translateX(0) skewX(-16deg); } 100% { transform: translateX(-130%) skewX(-16deg); } }
@keyframes tx-center { 0% { transform: scaleY(0); } 38%, 62% { transform: scaleY(1); } 100% { transform: scaleY(0); } }
@keyframes tx-caption { 0%, 30% { opacity: 0; transform: translateY(12px); } 42%, 60% { opacity: 1; transform: none; } 75%, 100% { opacity: 0; transform: translateY(-12px); } }
@media (prefers-reduced-motion: reduce) { .tx-effect { animation-timing-function: steps(1,end) !important; } }
`;

export default function TransitionConceptsPage() {
  const [selected, setSelected] = useState(0);
  const [run, setRun] = useState(0);
  const [scene, setScene] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!run) return;
    const change = setTimeout(() => setScene((value) => !value), 700);
    const end = setTimeout(() => setPlaying(false), 1450);
    return () => {
      clearTimeout(change);
      clearTimeout(end);
    };
  }, [run]);
  const play = (index: number) => {
    if (playing) return;
    setSelected(index);
    setPlaying(true);
    setRun((value) => value + 1);
  };
  const motion = (name: string) => ({
    animation: `${name} 1400ms cubic-bezier(.65,0,.35,1) both`,
  });
  return (
    <main className="min-h-screen bg-[#08090c] px-6 py-6 text-white">
      <style>{CSS}</style>
      <div className="mx-auto max-w-[1440px]">
        <h1 className="text-xl font-bold">화면 전환 시안</h1>
        <p className="mt-2 text-sm text-white/50">
          전환 모양을 비교해 볼 수 있습니다. 선택한 스타일과 색상, 직접 만든
          WebM 영상은 방송 화면 설정에서 지정하세요.
        </p>
        <Link href="/settings/broadcast" className="mt-3 inline-flex rounded-md border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10">방송 화면 설정에서 적용하기 →</Link>
        <div className="my-5 grid grid-cols-3 gap-3">
          {OPTIONS.map((option, index) => (
            <button
              key={option.name}
              disabled={playing}
              aria-pressed={selected === index}
              onClick={() => play(index)}
              className={`rounded-lg border p-4 text-left disabled:opacity-60 ${selected === index ? "border-white/60 bg-white/10" : "border-white/10 hover:bg-white/5"}`}
            >
              <span className="block font-bold">
                {index + 1}. {option.name}
              </span>
              <span className="mt-1 block text-xs text-white/50">
                {option.detail}
              </span>
            </button>
          ))}
        </div>
        <div
          className="relative aspect-video overflow-hidden rounded-lg border border-white/10"
          style={{
            containerType: "inline-size",
            background: scene ? "#0b1019" : "#171a20",
          }}
        >
          <div className="absolute inset-[4%] border border-white/10" />
          <div className="absolute left-[6%] top-[9%] text-[1.6cqw] font-bold text-white/50">
            제1회 넥서스 내전 리그 · 결승
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-[2cqw] font-black text-white/60">
              {scene ? "최종 승리" : "경기 소개"}
            </p>
            <h2 className="mt-[2cqw] text-[8cqw] font-black leading-none text-[#3b82f6]">
              블루 웨이브
            </h2>
            <p className="mt-[3cqw] text-[2.5cqw] font-black text-white/65">
              {scene ? "세트 2 : 1 · 킬 27 : 14" : "vs 레드 스톰 · 3판 2선승"}
            </p>
          </div>
          {playing && (
            <div key={run} className="pointer-events-none absolute inset-0">
              {selected === 0 && (
                <>
                  <div
                    className="tx-effect absolute inset-y-0 left-0 w-1/2 border-r-4 border-[#3b82f6] bg-[#101319]"
                    style={motion("tx-left")}
                  />
                  <div
                    className="tx-effect absolute inset-y-0 right-0 w-1/2 border-l-4 border-[#3b82f6] bg-[#101319]"
                    style={motion("tx-right")}
                  />
                </>
              )}
              {selected === 1 && (
                <div
                  className="tx-effect absolute -inset-x-[20%] inset-y-0 border-x-[12px] border-[#3b82f6] bg-[#101319]"
                  style={motion("tx-diagonal")}
                />
              )}
              {selected === 2 && (
                <div
                  className="tx-effect absolute inset-0 border-y-4 border-[#3b82f6] bg-[#101319]"
                  style={motion("tx-center")}
                />
              )}
              <div
                className="tx-effect absolute inset-0 flex items-center justify-center text-[5cqw] font-black tracking-wider"
                style={motion("tx-caption")}
              >
                NEXUS
              </div>
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={playing}
          onClick={() => play(selected)}
          className="mt-5 rounded-lg bg-white px-5 py-3 font-bold text-black disabled:opacity-50"
        >
          {playing ? "재생 중…" : "선택한 전환 다시 보기"}
        </button>
      </div>
    </main>
  );
}
