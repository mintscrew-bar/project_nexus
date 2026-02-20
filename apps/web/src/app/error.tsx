'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page Error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-8 max-w-md w-full text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-text-primary mb-2">
          문제가 발생했습니다
        </h2>
        <p className="text-text-secondary text-sm mb-6">
          페이지를 로드하는 중 오류가 발생했습니다.
          {error.digest && (
            <span className="block mt-1 text-text-tertiary text-xs">
              오류 코드: {error.digest}
            </span>
          )}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-accent-primary hover:bg-accent-hover active:bg-accent-active text-white font-medium rounded-lg transition-colors duration-150"
          >
            다시 시도
          </button>
          <button
            onClick={() => (window.location.href = '/')}
            className="px-6 py-2.5 bg-bg-tertiary hover:bg-bg-elevated text-text-primary font-medium border border-text-tertiary rounded-lg transition-colors duration-150"
          >
            홈으로
          </button>
        </div>
      </div>
    </div>
  );
}
