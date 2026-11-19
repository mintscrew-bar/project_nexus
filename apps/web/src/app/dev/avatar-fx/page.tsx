"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  AvatarDecoration,
  type AvatarEffectCode,
} from "@/components/cosmetics/avatar-effects";

/**
 * 개발용 — 아바타 장식 하나를 크게 보여 준다(움직임을 영상으로 확인할 때).
 * /dev/avatar-fx?code=dragon_orbit&size=240
 */
function Preview() {
  const params = useSearchParams();
  const code = (params.get("code") ?? "dragon_orbit") as AvatarEffectCode;
  const size = Number(params.get("size") ?? 240);
  return (
    <div className="flex min-h-[80vh] items-center justify-center bg-bg-primary">
      <div data-avatar-fx-preview className="p-[160px]">
        <AvatarDecoration code={code} size={size}>
          <div
            className="rounded-full bg-gradient-to-br from-sky-400 to-indigo-700"
            style={{ width: size, height: size }}
          />
        </AvatarDecoration>
      </div>
    </div>
  );
}

export default function AvatarFxDevPage() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  );
}
