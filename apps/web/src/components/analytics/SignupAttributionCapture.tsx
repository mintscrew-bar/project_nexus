"use client";

import { useEffect } from "react";
import { buildSignupAttribution } from "@nexus/types";

const COOKIE = "nx_attr";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * 첫 방문의 유입 경로를 1st-party 쿠키에 남긴다. 서버는 가입하는 순간에만 이 쿠키를
 * 읽어 유저에 한 번 기록한다.
 *
 * - **첫 방문만** 기록한다. 이미 쿠키가 있으면 덮어쓰지 않는다(마지막 접점이 아니라
 *   처음 어디서 왔는지가 알고 싶은 것이다).
 * - 개인 식별 정보는 없다. 리퍼러는 호스트만 담는다.
 * - 쿠키가 막혀 있으면 조용히 건너뛴다. 유입을 못 아는 것일 뿐 서비스에는 영향이 없다.
 */
export function SignupAttributionCapture() {
  useEffect(() => {
    try {
      if (document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`))) {
        return;
      }
      const value = buildSignupAttribution({
        search: window.location.search,
        referrer: document.referrer,
        ownHost: window.location.hostname,
      });
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie =
        `${COOKIE}=${encodeURIComponent(JSON.stringify(value))}` +
        `; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
    } catch {
      // 쿠키 접근이 막힌 환경 — 유입 경로 없이 진행
    }
  }, []);

  return null;
}
