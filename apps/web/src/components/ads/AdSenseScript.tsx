import { ADSENSE_CLIENT } from "@/lib/adsense";

export function AdSenseScript() {
  return (
    <script
      id="adsense-loader"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      async
      crossOrigin="anonymous"

    />
  );
}
