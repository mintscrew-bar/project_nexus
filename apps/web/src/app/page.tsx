import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-center mb-6">
            <Logo size="xl" />
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6">
            <span className="text-primary-500">Project</span>{" "}
            <span className="text-accent-blue">Nexus</span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-400 mb-8">
            LoL 내전 토너먼트의 새로운 기준
          </p>
          <p className="text-lg text-gray-500 mb-12 max-w-2xl mx-auto">
            경매 드래프트, 실시간 밸런싱, Discord 연동까지.
            <br />
            프로처럼 내전을 즐기세요.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/login" className="btn-primary text-lg">
              Discord로 시작하기
            </Link>
            <Link href="/about" className="btn-secondary text-lg">
              자세히 알아보기
            </Link>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-5xl mx-auto">
          <div className="card text-center">
            <div className="text-4xl mb-4">🎯</div>
            <h3 className="text-xl font-semibold text-primary-500 mb-2">
              경매 드래프트
            </h3>
            <p className="text-gray-400">
              실시간 입찰로 공정하고 재미있는 팀 구성
            </p>
          </div>

          <div className="card text-center">
            <div className="text-4xl mb-4">⚖️</div>
            <h3 className="text-xl font-semibold text-primary-500 mb-2">
              자동 밸런싱
            </h3>
            <p className="text-gray-400">
              티어와 전적 기반의 정확한 팀 밸런스
            </p>
          </div>

          <div className="card text-center">
            <div className="text-4xl mb-4">🎮</div>
            <h3 className="text-xl font-semibold text-primary-500 mb-2">
              Discord 연동
            </h3>
            <p className="text-gray-400">
              음성 채널 자동 이동, 알림, 봇 명령어
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
