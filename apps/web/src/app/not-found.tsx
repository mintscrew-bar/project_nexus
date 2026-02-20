import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-8 max-w-md w-full text-center">
        <div className="text-6xl font-bold text-accent-primary mb-2">404</div>
        <h2 className="text-xl font-bold text-text-primary mb-2">
          페이지를 찾을 수 없습니다
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          요청하신 페이지가 존재하지 않거나 이동되었습니다.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-2.5 bg-accent-primary hover:bg-accent-hover active:bg-accent-active text-white font-medium rounded-lg transition-colors duration-150 inline-block"
          >
            홈으로 돌아가기
          </Link>
          <Link
            href="/rooms"
            className="px-6 py-2.5 bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-medium border border-text-tertiary rounded-lg transition-colors duration-150 inline-block"
          >
            방 목록
          </Link>
        </div>
      </div>
    </div>
  );
}
