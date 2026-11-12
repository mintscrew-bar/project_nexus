"use client";

// 개발용 프리뷰 — 방 만들기 창과 로비 "방 설정" 창 비교
// 접속: http://localhost:3010/dev/room-settings?view=create|settings

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { RoomCreationForm } from "@/components/rooms/RoomCreationForm";
import { RoomSettingsModal } from "@/components/domain/RoomSettingsModal";

function Preview() {
  // 창은 포털이라 서버 렌더와 어긋난다 — 브라우저에서만 그린다
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  const view = useSearchParams().get("view") ?? "settings";
  if (!mounted) return null;
  if (view === "create") {
    return (
      <Modal isOpen onClose={() => {}} title="새 내전 방 생성" size="full">
        <RoomCreationForm gameTitle="LOL" onCancel={() => {}} />
      </Modal>
    );
  }
  return (
    <RoomSettingsModal
      isOpen
      onClose={() => {}}
      room={{
        id: "preview",
        name: "금요일 밤 5:5 내전",
        maxParticipants: 10,
        isPrivate: false,
        teamMode: "AUCTION",
        allowSpectators: true,
        closeOnHostLeave: false,
        startingPoints: 1000,
        minBidIncrement: 50,
        bidTimeLimit: 30,
        pickTimeLimit: 60,
        bracketFormat: "SINGLE_ELIMINATION",
        seriesPreset: null,
        gameTitle: "LOL",
      }}
    />
  );
}

export default function Page() {
  return (
    <Suspense>
      <Preview />
    </Suspense>
  );
}
