"use client";

import { useEffect } from "react";
import { getDdragonVersion } from "@/lib/ddragon";

/**
 * 로컬 게임 아이콘(/icons/...) 로드가 실패하면 CDN 으로 바꿔 끼우는 전역 처리기.
 *
 * 로컬 아이콘은 scripts/update-ddragon-assets.mjs 가 패치마다 받아 오지만, 패치
 * 직후 갱신 전에는 신규 챔피언·아이템 파일이 없다. 화면마다 onError 를 따로 달면
 * 빠지는 곳이 생긴다(2026-10-02 점검: 매치 상세·프로필 등 13곳이 폴백 없이 깨짐).
 * 그래서 문서 전체의 이미지 error 이벤트를 캡처 단계에서 한 번에 받는다
 * (error 는 버블링되지 않아 캡처로만 잡힌다).
 *
 * - next/image 는 src 가 /_next/image?url=%2Ficons%2F... 로 바뀌므로 url 파라미터를 푼다.
 * - 한 이미지당 한 번만 바꾼다(data-icon-cdn). CDN 도 실패하면 그대로 둔다.
 * - 룬(perks)은 CDN 주소가 ID 가 아니라 icon 경로라 여기서 만들 수 없다 — RuneTooltip 이 따로 처리한다.
 */

const LOCAL_ICON = /^\/icons\/(champions|items|spells)\/([^/?#]+)\.png$/;
const DDRAGON = "https://ddragon.leagueoflegends.com/cdn";

/** img 의 현재 주소에서 로컬 아이콘 경로를 뽑는다. next/image 주소도 푼다. */
function localIconPath(src: string): string | null {
  try {
    const url = new URL(src, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (url.pathname === "/_next/image") {
      return url.searchParams.get("url");
    }
    return url.pathname;
  } catch {
    return null;
  }
}

async function cdnUrlFor(path: string): Promise<string | null> {
  const match = LOCAL_ICON.exec(path);
  if (!match) return null;
  const [, kind, name] = match;
  if (kind === "champions") {
    // CommunityDragon 은 챔피언 키("Locke")와 숫자 ID("805") 둘 다 받는다.
    // getChampionIconById 가 표에 없는 ID 를 /icons/champions/805.png 로 내보내는 경우도 살린다.
    return `https://cdn.communitydragon.org/latest/champion/${encodeURIComponent(name)}/square`;
  }
  const version = await getDdragonVersion();
  return kind === "items"
    ? `${DDRAGON}/${version}/img/item/${name}.png`
    : `${DDRAGON}/${version}/img/spell/${name}.png`;
}

export function IconCdnFallback() {
  useEffect(() => {
    const onError = (event: Event) => {
      const img = event.target;
      if (!(img instanceof HTMLImageElement)) return;
      // 자체 폴백을 가진 이미지(ChampionIcon·ChampionImage·ItemImage 등)는 건드리지 않는다.
      if (img.dataset.iconCdn || img.hasAttribute("data-own-fallback")) return;
      const path = localIconPath(img.currentSrc || img.src);
      if (!path || !LOCAL_ICON.test(path)) return;
      img.dataset.iconCdn = "1";
      void cdnUrlFor(path).then((cdn) => {
        if (!cdn) return;
        // next/image 는 srcset 을 함께 주므로 비워야 src 가 쓰인다.
        img.removeAttribute("srcset");
        img.removeAttribute("sizes");
        img.src = cdn;
      });
    };
    document.addEventListener("error", onError, true);
    return () => document.removeEventListener("error", onError, true);
  }, []);

  return null;
}
