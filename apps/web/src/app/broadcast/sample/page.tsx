"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PreviewStage } from "../preview/_mocks";

/**
 * /broadcast/sample — 방송 설정 화면의 실시간 미리보기(iframe 안에서 쓴다).
 *
 * 목업 데이터만 그리므로 로그인·토큰이 필요 없다. 설정은 부모 창(같은 사이트)이
 * postMessage 로 보낸다 — 고칠 때마다 iframe 을 새로 불러오지 않고 바로 다시 그린다.
 * 장면은 ?scene= 으로 고른다.
 */
const MESSAGE_TYPE = "nexus-broadcast-settings";

function SampleStage() {
  const params = useSearchParams();
  const sceneKey = params.get("scene") ?? "auction";
  const [settings, setSettings] = useState<unknown>(undefined);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // 같은 사이트에서 보낸 설정만 받는다
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== MESSAGE_TYPE) return;
      setSettings(event.data.settings);
    };
    window.addEventListener("message", onMessage);
    // 준비됐다고 알려 부모가 첫 설정을 보내게 한다
    window.parent?.postMessage(
      { type: `${MESSAGE_TYPE}:ready` },
      window.location.origin,
    );
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return <PreviewStage sceneKey={sceneKey} bg="opaque" settings={settings} />;
}

export default function BroadcastSamplePage() {
  return (
    <Suspense>
      <SampleStage />
    </Suspense>
  );
}
