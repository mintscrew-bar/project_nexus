// 비로그인·검색봇용 랜딩 콘텐츠 — 서버 컴포넌트로 항상 SSR HTML에 포함된다.
// (HomeAuthOverlay의 로딩 게이트 밖에 두어 봇이 본문 텍스트를 읽을 수 있게 함)
import { HeroBanner } from "@/components/home/HeroBanner";
import { DiscordBanner } from "@/components/home/DiscordBanner";
import { AdSlotCard } from "@/components/ads/AdSlot";

export default function LandingContent() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* 히어로 배너 — 궤도 + 파티클 + Framer Motion */}
      <HeroBanner />

      {/* Discord 배너 — 히어로 바로 아래 */}
      <section className="px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <DiscordBanner />
        </div>
      </section>

      {/* Feature highlights */}
      <section id="features" className="py-24 md:py-32 px-6">
        <h2 className="text-3xl md:text-5xl font-bold text-center text-text-primary mb-16">
          엑셀로 하던 내전,{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #8b5cf6, #6366f1, #d946ef)" }}
          >
            이제 그만할 때
          </span>
          {" "}됐잖아요.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 max-w-6xl mx-auto">
          <div className="group flex flex-col items-center text-center p-8 md:p-10 rounded-2xl bg-bg-secondary/50 border border-bg-tertiary hover:border-violet-500/30 transition-all duration-300 hover:scale-[1.02]">
            <div className="text-6xl md:text-7xl mb-6">🎯</div>
            <h3 className="text-2xl md:text-3xl font-bold text-text-primary mb-3">
              경매 드래프트
            </h3>
            <p className="text-lg text-text-secondary leading-relaxed">
              팀 구성부터가 이미 게임입니다. 경매 시작.<br className="hidden md:block" />
              팀장님, 그 포인트로 얘를 산다구요?
            </p>
          </div>

          <div className="group flex flex-col items-center text-center p-8 md:p-10 rounded-2xl bg-bg-secondary/50 border border-bg-tertiary hover:border-violet-500/30 transition-all duration-300 hover:scale-[1.02]">
            <div className="text-6xl md:text-7xl mb-6">⚖️</div>
            <h3 className="text-2xl md:text-3xl font-bold text-text-primary mb-3">
              자동 밸런싱
            </h3>
            <p className="text-lg text-text-secondary leading-relaxed">
              한쪽만 터지는 내전은<br className="hidden md:block" />
              이제 그만할 때 됐잖아요.
            </p>
          </div>

          <div className="group flex flex-col items-center text-center p-8 md:p-10 rounded-2xl bg-bg-secondary/50 border border-bg-tertiary hover:border-violet-500/30 transition-all duration-300 hover:scale-[1.02]">
            <div className="text-6xl md:text-7xl mb-6">🎮</div>
            <h3 className="text-2xl md:text-3xl font-bold text-text-primary mb-3">
              Discord 연동
            </h3>
            <p className="text-lg text-text-secondary leading-relaxed">
              음성 이동, 결과 기록, 전부 &lsquo;딸깍&rsquo;.<br className="hidden md:block" />
              당신은 게임만 하세요.
            </p>
          </div>
        </div>
      </section>

      {/* 광고 슬롯 — features 와 운영 섹션 사이, 시각적 분리선 역할 겸함 */}
      <section className="px-6 pb-8">
        <div className="mx-auto max-w-4xl">
          <AdSlotCard slotKey="landingMid" minHeight={120} />
        </div>
      </section>

      <section className="px-6 pb-24 md:pb-32">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 max-w-3xl">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary">
              롤 내전, 전적, 스크림을 한 흐름으로 관리
            </h2>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-text-secondary">
              Nexus는 리그 오브 레전드 내전과 스크림을 운영하는 팀을 위해
              참가자 모집, 팀 밸런싱, 경기 기록, 롤 전적 확인, 챔피언 통계
              분석을 연결합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <article className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-6">
              <h3 className="text-xl font-semibold text-text-primary">롤 내전 운영</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                디스코드 기반 참가, 팀 구성, 경매 드래프트, 결과 기록까지
                내전 진행에 필요한 과정을 한곳에서 처리합니다.
              </p>
            </article>

            <article className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-6">
              <h3 className="text-xl font-semibold text-text-primary">롤 전적 분석</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                내전 기록과 랭크 기록을 구분해 챔피언 승률, 포지션, KDA,
                장인 빌드 흐름을 비교할 수 있습니다.
              </p>
            </article>

            <article className="rounded-lg border border-bg-tertiary bg-bg-secondary/50 p-6">
              <h3 className="text-xl font-semibold text-text-primary">롤 스크림 관리</h3>
              <p className="mt-3 text-sm leading-relaxed text-text-secondary">
                고정 팀, 클랜, 커뮤니티 스크림에서 반복되는 매칭과 기록
                관리를 줄이고 다음 경기 준비에 집중할 수 있게 돕습니다.
              </p>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
