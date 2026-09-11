import Script from "next/script";

import { ADSENSE_CLIENT } from "@/lib/adsense";

/**
 * AdSense 로더.
 *
 * **`next/script` 를 쓴다.** 맨 `<script src>` 로 두면 React 가 이걸
 * `<head>` 로 끌어올리는데, AdSense 가 로드되면서 자기 스크립트를 같은
 * 자리에 또 밀어 넣는다. 그러면 하이드레이션 때 React 가 기대한 자리에
 * 다른 태그가 있어서 트리가 어긋난다 — 루트 레이아웃의 JSON-LD 가
 * "type=null, src=pagead2..." 로 어긋나 보이던 게 그 증상이다.
 *
 * `next/script` 는 주입을 React 재조정 밖에서 처리해 이 충돌이 없다.
 */
export function AdSenseScript() {
  return (
    <Script
      id="adsense-loader"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      strategy="afterInteractive"
      crossOrigin="anonymous"
    />
  );
}
