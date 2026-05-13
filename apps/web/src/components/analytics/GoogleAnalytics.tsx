import Script from "next/script";

// Google Analytics 4 + Consent Mode v2
// - NEXT_PUBLIC_GA_ID 미설정 시 아무것도 렌더하지 않음 (로컬 개발 안전)
// - Consent Mode v2: 기본은 모두 denied. 사용자가 동의 버튼을 누르면
//   ConsentBanner가 gtag('consent', 'update', ...)로 granted로 전환.
export function GoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  if (!gaId) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;

          // Consent Mode v2 — 동의 전 기본값(모두 거부, 광고 personalization도 거부)
          gtag('consent', 'default', {
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'denied',
            wait_for_update: 500
          });

          // localStorage에 이전 동의 기록이 있으면 즉시 반영
          try {
            var saved = localStorage.getItem('nexus_consent');
            if (saved === 'granted') {
              gtag('consent', 'update', {
                ad_storage: 'granted',
                ad_user_data: 'granted',
                ad_personalization: 'granted',
                analytics_storage: 'granted'
              });
            }
          } catch (e) {}

          gtag('js', new Date());
          // send_page_view: false — App Router에서 PageViewTracker가 수동 전송
          gtag('config', '${gaId}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
