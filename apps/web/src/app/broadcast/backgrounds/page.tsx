"use client";

import { useState } from "react";
import { BackgroundMotion } from "../[token]/_components/BackgroundMotion";

const CONCEPTS = [
  {
    name: "01 스튜디오",
    description: "차콜 · 얇은 프레임 · 넓은 여백",
    background: "linear-gradient(125deg, #171a20, #0b0d12 60%)",
  },
  {
    name: "02 아레나",
    description: "양 진영 색 · 대칭 구도 · 중앙 집중",
    background:
      "linear-gradient(90deg, #0b1b32 0%, #0a101a 38%, #0a101a 62%, #2a1119 100%)",
  },
  {
    name: "03 테크니컬",
    description: "사선 면 · 미세한 선 · 중계 그래픽",
    background:
      "linear-gradient(115deg, #101a23 0%, #101a23 27%, #0a1017 27%, #0a1017 74%, #17202a 74%)",
  },
];

function ConceptStage({ index }: { index: number }) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ background: CONCEPTS[index].background }}
    >
      {(index === 0 || index === 2) && (
        <BackgroundMotion type={index === 0 ? "studio" : "technical"} />
      )}
      {index === 0 && (
        <>
          <div className="absolute inset-[4%] border border-white/[0.07]" />
          {[
            "top-[4%] left-[4%] border-l border-t",
            "top-[4%] right-[4%] border-r border-t",
            "bottom-[4%] left-[4%] border-l border-b",
            "bottom-[4%] right-[4%] border-r border-b",
          ].map((position) => (
            <div
              key={position}
              className={`absolute h-[5%] w-[3%] border-white/35 ${position}`}
            />
          ))}
          <div className="absolute left-[4%] top-[35%] h-[30%] w-[2px] bg-white/15" />
        </>
      )}
      {index === 1 && (
        <>
          <div className="absolute inset-y-0 left-0 w-[1%] bg-[#397ff5]" />
          <div className="absolute inset-y-0 right-0 w-[1%] bg-[#f04450]" />
          <div className="absolute inset-y-[8%] left-1/2 w-px bg-white/[0.06]" />
          <div className="absolute inset-x-[5%] top-[7%] h-px bg-white/10" />
          <div className="absolute inset-x-[5%] bottom-[7%] h-px bg-white/10" />
        </>
      )}
      {index === 2 && (
        <>
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent 0px, transparent 47px, #a6bed5 48px)",
            }}
          />
          <div className="absolute -top-[20%] left-[23%] h-[140%] w-px rotate-[25deg] bg-white/15" />
          <div className="absolute -top-[20%] right-[23%] h-[140%] w-px rotate-[25deg] bg-white/15" />
          <div className="absolute bottom-[5%] right-[5%] flex gap-1">
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className="h-1 w-3 bg-white/15" />
            ))}
          </div>
        </>
      )}
      <div className="absolute left-[5%] top-[7%] text-[1.4cqw] font-black text-white/45">
        제1회 넥서스 내전 리그
      </div>
      <div className="absolute inset-x-0 top-[35%] text-center">
        <div className="flex items-center justify-center gap-[1.4cqw]">
          <span className="text-[1.8cqw] font-black text-white/50">2세트</span>
          <span className="h-[2cqw] w-px bg-white/20" />
          <h2 className="text-[3.4cqw] font-black text-white">
            진영 교대 완료
          </h2>
        </div>
        <p className="mt-[.7cqw] text-[1.4cqw] font-bold text-white/45">
          양 팀 준비 후 경기가 시작됩니다
        </p>
      </div>
      <div className="absolute inset-x-[6%] top-[56%] grid grid-cols-2 gap-[9%] text-center font-black">
        <div className="text-[#3b82f6]">
          <p className="text-[1.4cqw]">블루 진영</p>
          <p className="mt-[1cqw] text-[5.8cqw] leading-tight">레드 스톰</p>
        </div>
        <div className="text-[#ef4444]">
          <p className="text-[1.4cqw]">레드 진영</p>
          <p className="mt-[1cqw] text-[5.8cqw] leading-tight">블루 웨이브</p>
        </div>
      </div>
    </div>
  );
}

/** 배경 비교용 독립 시안. 운영 오버레이에는 선택 결과를 저장하지 않는다. */
export default function BackgroundConceptsPage() {
  const [selected, setSelected] = useState(0);
  return (
    <main
      className="min-h-screen bg-[#08090c] px-6 py-6 text-white"
      style={{ fontFamily: "Arial, sans-serif" }}
    >
      <div className="mx-auto max-w-[1440px]">
        <h1 className="text-xl font-bold">방송 오버레이 배경 시안</h1>
        <p className="mt-2 text-sm text-white/50">
          같은 내용과 크기로 비교합니다. 버튼을 누르면 큰 화면이 바뀝니다.
        </p>
        <div className="my-5 grid grid-cols-3 gap-3">
          {CONCEPTS.map((concept, index) => (
            <button
              key={concept.name}
              type="button"
              aria-pressed={selected === index}
              onClick={() => setSelected(index)}
              className={`rounded-lg border px-4 py-3 text-left ${selected === index ? "border-white/65 bg-white/10" : "border-white/10 bg-white/[0.02] hover:bg-white/5"}`}
            >
              <span className="block font-bold">{concept.name}</span>
              <span className="mt-1 block text-xs text-white/50">
                {concept.description}
              </span>
            </button>
          ))}
        </div>
        <div
          className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/10"
          style={{ containerType: "inline-size" }}
        >
          <ConceptStage index={selected} />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {CONCEPTS.map((concept, index) => (
            <button
              key={concept.name}
              type="button"
              onClick={() => setSelected(index)}
              aria-label={`${concept.name} 크게 보기`}
              className="relative aspect-video overflow-hidden rounded border border-white/10"
              style={{ containerType: "inline-size" }}
            >
              <ConceptStage index={index} />
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
