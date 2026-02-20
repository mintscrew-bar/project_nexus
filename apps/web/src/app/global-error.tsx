'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ko">
      <body style={{ backgroundColor: '#0f0f0f', color: '#f0f0f0', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #242424',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '28rem',
            width: '100%',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💥</div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              심각한 오류가 발생했습니다
            </h2>
            <p style={{ color: '#b0b0b0', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              애플리케이션에서 예기치 않은 오류가 발생했습니다.
            </p>
            <button
              onClick={reset}
              style={{
                padding: '0.625rem 1.5rem',
                backgroundColor: '#0bc4e2',
                color: 'white',
                fontWeight: 500,
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
