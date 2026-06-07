import Script from "next/script";

const ADSENSE_CLIENT_ID = "ca-pub-9854590549377922";

export function AdSenseScript() {
  return (
    <Script
      id="adsense-loader"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
  );
}
