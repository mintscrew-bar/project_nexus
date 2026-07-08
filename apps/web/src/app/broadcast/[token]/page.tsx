"use client";

import { useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { broadcastApi } from "@/lib/api-client";
import { connectBroadcastSocket } from "@/lib/socket-client";
import { BroadcastShell } from "./_components/BroadcastShell";
import { LowerThird } from "./_components/LowerThird";
import {
  RoomScene,
  MatchScene,
  IdleScene,
  BracketScene,
  RoleSelectionScene,
} from "./_components/scenes";
import { BroadcastAuctionLive } from "./_components/BroadcastAuctionLive";

const SCENE_TRANSITIONS: Record<
  string,
  {
    label: string;
    subLabel?: string;
    eyebrow?: string;
    tone?: "phase" | "match" | "result";
  }
> = {
  idle: {
    label: "STANDBY",
    subLabel: "방송 대기",
    eyebrow: "NEXUS LIVE",
    tone: "phase",
  },
  waiting: {
    label: "WAITING ROOM",
    subLabel: "내전 대기",
    eyebrow: "ROOM STATUS",
    tone: "phase",
  },
  auction: {
    label: "AUCTION DRAFT",
    subLabel: "경매 드래프트",
    eyebrow: "NEXT PHASE",
    tone: "phase",
  },
  "role-selection": {
    label: "ROLE SELECTION",
    subLabel: "포지션 선택",
    eyebrow: "NEXT PHASE",
    tone: "phase",
  },
  draft: {
    label: "DRAFT PHASE",
    subLabel: "드래프트 진행",
    eyebrow: "NEXT PHASE",
    tone: "phase",
  },
  bracket: {
    label: "BRACKET",
    subLabel: "대진표",
    eyebrow: "TOURNAMENT",
    tone: "phase",
  },
  match: {
    label: "MATCH READY",
    subLabel: "경기 전환",
    eyebrow: "MATCH STATUS",
    tone: "match",
  },
  result: {
    label: "RESULT",
    subLabel: "경기 결과",
    eyebrow: "RESULT CONFIRMED",
    tone: "result",
  },
};

function sceneKeyOf({
  idle,
  scene,
  status,
  teamMode,
  isAuctionRoom,
  matchStatus,
}: {
  idle?: boolean;
  scene: string;
  status?: string;
  teamMode?: string;
  isAuctionRoom: boolean;
  matchStatus?: string;
}) {
  if (idle) return "idle";
  if (scene === "idle" || scene === "break") return "idle";
  if (scene === "bracket") return "bracket";
  if (scene === "auction") return "auction";
  if (scene === "role-selection") return "role-selection";
  if (scene === "result") return "result";
  if (scene === "room") return "waiting";
  if (scene === "match") {
    return matchStatus === "COMPLETED" ? "result" : "match";
  }
  if (isAuctionRoom) return "auction";
  if (status === "ROLE_SELECTION" || status === "ROLE_SELECT") {
    return "role-selection";
  }
  if (status === "DRAFT" && teamMode !== "AUCTION") return "draft";
  return "waiting";
}

/**
 * /broadcast/[token] — OBS 브라우저 소스용 읽기전용 방송 오버레이.
 * 로그인 불필요(토큰 인증). 스냅샷 hydrate + 소켓 이벤트로 갱신.
 */
export default function BroadcastPage() {
  const params = useParams();
  const search = useSearchParams();
  const queryClient = useQueryClient();

  const token = params.token as string;
  const scene = (search?.get("scene") ?? "control") as string;
  const bg = (search?.get("bg") === "opaque" ? "opaque" : "transparent") as
    | "opaque"
    | "transparent";
  const matchId = search?.get("matchId") ?? undefined;

  const queryKey = useMemo(
    () => ["broadcastSnapshot", token, scene, matchId],
    [token, scene, matchId],
  );

  const { data: snapshot, isError } = useQuery({
    queryKey,
    queryFn: () => broadcastApi.getSnapshot(token, { scene, matchId }),
    enabled: Boolean(token),
    // 룸 status 전환(대기→경매 등)은 룸 네임스페이스 미구독이라 폴백 폴링으로 커버
    refetchInterval: 5000,
    staleTime: 2000,
  });

  const roomId = snapshot?.room?.id as string | undefined;
  const status = snapshot?.room?.status;
  const teamMode = snapshot?.room?.teamMode;
  const controlledScene =
    scene === "control" ? snapshot?.broadcast?.scene ?? "auto" : scene;
  const isAuctionRoom =
    controlledScene === "auction" ||
    (controlledScene === "auto" &&
      (status === "AUCTION" || (status === "DRAFT" && teamMode === "AUCTION")));
  const broadcastSceneKey = sceneKeyOf({
    idle: snapshot?.idle,
    scene: controlledScene,
    status,
    teamMode,
    isAuctionRoom,
    matchStatus: snapshot?.match?.status,
  });
  const transition =
    SCENE_TRANSITIONS[broadcastSceneKey] ?? SCENE_TRANSITIONS.waiting;

  // 방송 소켓: bracket 룸 구독 → 경기 시작/결과/focus 변경 시 즉시 스냅샷 갱신
  useEffect(() => {
    if (!token || !roomId) return;
    const socket = connectBroadcastSocket(token);
    const refetch = () => queryClient.invalidateQueries({ queryKey });

    const subscribe = () => socket.emit("join-bracket", { roomId });
    socket.on("connect", subscribe);
    if (socket.connected) subscribe();

    socket.on("match-started", refetch);
    socket.on("match-result", refetch);
    socket.on("bracket-generated", refetch);
    socket.on("bracket-updated", refetch);
    socket.on("broadcast-focus-updated", refetch);
    socket.on("broadcast-control-updated", refetch);

    return () => {
      socket.off("connect", subscribe);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [token, roomId, queryClient, queryKey]);

  if (isError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-transparent">
        <p className="text-3xl font-bold text-white/50">
          유효하지 않은 방송 링크입니다
        </p>
      </div>
    );
  }

  if (!snapshot) {
    return <div className="fixed inset-0 bg-transparent" />;
  }

  const sceneNode = snapshot.idle || controlledScene === "idle" || controlledScene === "break" ? (
    <IdleScene snapshot={snapshot} />
  ) : controlledScene === "bracket" ? (
    <BracketScene snapshot={snapshot} />
  ) : controlledScene === "match" || controlledScene === "result" ? (
    <MatchScene snapshot={snapshot} />
  ) : isAuctionRoom && token && roomId ? (
    // 경매 단계는 정적 스냅샷 대신 기존 경매 화면(AuctionBoard)을 라이브로 중계
    <BroadcastAuctionLive token={token} roomId={roomId} />
  ) : controlledScene === "role-selection" || broadcastSceneKey === "role-selection" ? (
    <RoleSelectionScene snapshot={snapshot} />
  ) : (
    <RoomScene snapshot={snapshot} />
  );

  const persistent =
    snapshot?.broadcast?.lowerThirdVisible === false || controlledScene === "match"
      ? null
      : (
          <>
            <LowerThird snapshot={snapshot} />
            <BroadcastAnnouncement text={snapshot?.broadcast?.announcement} />
          </>
        );

  return (
    <BroadcastShell
      bg={bg}
      theme={snapshot.theme}
      scene={sceneNode}
      persistent={persistent}
      transitionKey={broadcastSceneKey}
      transition={transition}
    />
  );
}

function BroadcastAnnouncement({ text }: { text?: string | null }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute left-24 right-24 top-24 flex justify-center">
      <div className="max-w-[1280px] border-y border-white/18 bg-black/72 px-8 py-4 text-center text-2xl font-black text-white shadow-[0_20px_80px_rgba(0,0,0,0.42)]">
        {text}
      </div>
    </div>
  );
}
