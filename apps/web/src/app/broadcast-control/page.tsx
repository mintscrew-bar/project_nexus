"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeInfo,
  Coffee,
  Eye,
  EyeOff,
  Gamepad2,
  Gavel,
  ListTree,
  Loader2,
  MonitorPlay,
  Pause,
  Plus,
  RefreshCw,
  RotateCcw,
  Swords,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  broadcastApi,
  matchApi,
  type BroadcastControlPatch,
  type BroadcastControlRoom,
  type BroadcastControlScene,
  type BroadcastControlState,
} from "@/lib/api-client";
import {
  BROADCAST_ANNOUNCEMENT_MAX,
  BROADCAST_ANNOUNCEMENT_PRESET_MAX,
} from "@nexus/types";
import { useToast } from "@/components/ui/Toast";
import { useAuthStore } from "@/stores/auth-store";
import Link from "next/link";

/**
 * /broadcast-control — 방송 조작 패널 (팝업 창으로 여는 송출 콘솔).
 *
 * 구성 (2026-11-07 개편)
 *  - PROGRAM 모니터: 지금 OBS 로 나가는 오버레이를 그대로 작게 띄운다.
 *    방송 토큰 원문은 저장하지 않으므로, 본인 전용 단기 미리보기 토큰(pv_)으로 같은 페이지를 연다.
 *  - 장면: 방 진행 단계(대기 → 경매·드래프트 → 라인 선택 → 경기 → 종료)에 맞는 장면을 크게,
 *    나머지는 "다른 장면"으로 작게.
 *  - 즉석 연출: 결과 다시 보기, 선수 카드 띄우기, 휴식 카운트다운, 공지 프리셋.
 *
 * OBS 에는 컨트롤 UI 를 넣지 않는다 — 이 화면은 출력 장면만 바꾼다.
 */

type SceneDef = {
  scene: BroadcastControlScene;
  label: string;
  description: string;
  icon: typeof MonitorPlay;
};

const SCENES: Record<string, SceneDef> = {
  auto: {
    scene: "auto",
    label: "자동",
    description: "방 상태를 따라갑니다",
    icon: MonitorPlay,
  },
  idle: {
    scene: "idle",
    label: "대기",
    description: "방송 대기 화면",
    icon: Pause,
  },
  room: {
    scene: "room",
    label: "로비",
    description: "참가자 모집 현황",
    icon: Users,
  },
  auction: {
    scene: "auction",
    label: "경매",
    description: "라이브 경매판",
    icon: Gavel,
  },
  "role-selection": {
    scene: "role-selection",
    label: "라인 선택",
    description: "포지션 선택 현황",
    icon: Gamepad2,
  },
  bracket: {
    scene: "bracket",
    label: "대진표",
    description: "토너먼트 보드",
    icon: ListTree,
  },
  "match-intro": {
    scene: "match-intro",
    label: "경기 소개",
    description: "VS · 라인별 선수",
    icon: Swords,
  },
  match: {
    scene: "match",
    label: "경기 HUD",
    description: "게임 위 투명 정보",
    icon: Swords,
  },
  result: {
    scene: "result",
    label: "결과",
    description: "승리 · 지표 · MVP",
    icon: BadgeInfo,
  },
  summary: {
    scene: "summary",
    label: "전체 결과",
    description: "우승 팀 · 완료 대진",
    icon: Trophy,
  },
  break: {
    scene: "break",
    label: "휴식",
    description: "브레이크 화면",
    icon: Coffee,
  },
};

const ALL_SCENES: BroadcastControlScene[] = [
  "auto",
  "idle",
  "room",
  "auction",
  "role-selection",
  "bracket",
  "match-intro",
  "match",
  "result",
  "summary",
  "break",
];

const ROOM_STATUS_KO: Record<string, string> = {
  WAITING: "참가자 모집",
  TEAM_SELECTION: "팀 구성",
  DRAFT: "경매 · 드래프트",
  DRAFT_COMPLETED: "팀 확정",
  ROLE_SELECTION: "라인 선택",
  IN_PROGRESS: "경기 진행",
  COMPLETED: "종료",
};

const MATCH_STATUS_KO: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "대기", tone: "text-white/45 bg-white/5" },
  IN_PROGRESS: { label: "진행 중", tone: "text-red-300 bg-red-500/15" },
  COMPLETED: { label: "종료", tone: "text-emerald-300 bg-emerald-500/12" },
};

const ROLE_KO: Record<string, string> = {
  TOP: "탑",
  JUNGLE: "정글",
  MID: "미드",
  ADC: "원딜",
  SUPPORT: "서폿",
};

const BREAK_MINUTES = [3, 5, 10, 15];

/** 방 진행 단계별로 지금 쓸 만한 장면 — "자동"은 항상 맨 앞 */
function phaseScenes(
  status: string | null | undefined,
  teamMode: string | null | undefined,
): BroadcastControlScene[] {
  switch (status) {
    case undefined:
    case null:
      return ["auto", "idle", "break"];
    case "WAITING":
    case "TEAM_SELECTION":
      return ["auto", "room", "idle", "break"];
    case "DRAFT":
      return teamMode === "AUCTION"
        ? ["auto", "auction", "room", "break"]
        : ["auto", "room", "break"];
    case "DRAFT_COMPLETED":
    case "ROLE_SELECTION":
      return ["auto", "role-selection", "bracket", "break"];
    case "IN_PROGRESS":
      return ["auto", "bracket", "match-intro", "match", "result", "break"];
    case "COMPLETED":
      return ["auto", "summary", "result", "bracket"];
    default:
      return ["auto", "break"];
  }
}

type ControlMatch = {
  id: string;
  round?: number | null;
  matchNumber?: number | null;
  bracketRound?: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | string;
  teamA?: { id: string; name: string } | null;
  teamB?: { id: string; name: string } | null;
  winnerId?: string | null;
};

type ControlView = BroadcastControlState & {
  roomId: string | null;
  room: BroadcastControlRoom | null;
  focusMatchId: string | null;
};

/** 개발용 미리보기(?preview=1) 상태 — 로그인 없이 레이아웃만 본다 */
const MOCK_VIEW: ControlView = {
  scene: "auto",
  lowerThirdVisible: true,
  announcement: "잠시 후 2경기를 시작합니다.",
  breakEndsAt: null,
  roomId: "preview-room",
  room: {
    id: "preview-room",
    name: "제1회 넥서스 내전 리그",
    status: "IN_PROGRESS",
  } as BroadcastControlRoom,
  focusMatchId: "preview-match-1",
};

const MOCK_MATCHES: ControlMatch[] = [
  {
    id: "preview-match-1",
    round: 1,
    matchNumber: 1,
    status: "COMPLETED",
    teamA: { id: "team-a", name: "블루웨이브" },
    teamB: { id: "team-b", name: "레드폭풍" },
    winnerId: "team-a",
  },
  {
    id: "preview-match-2",
    round: 2,
    matchNumber: 2,
    status: "IN_PROGRESS",
    teamA: { id: "team-a", name: "블루웨이브" },
    teamB: { id: "team-c", name: "새벽감성" },
  },
  {
    id: "preview-match-3",
    round: 2,
    matchNumber: 3,
    status: "PENDING",
    teamA: { id: "team-d", name: "TBD" },
    teamB: null,
  },
];

const MOCK_TEAMS = [
  {
    id: "team-a",
    name: "블루웨이브",
    color: "#3B82F6",
    members: ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"].map((role, i) => ({
      userId: `a${i}`,
      username: ["하루", "정글러", "미드킹", "원딜장인", "와드요정"][i],
      assignedRole: role,
    })),
  },
  {
    id: "team-b",
    name: "레드폭풍",
    color: "#EF4444",
    members: ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"].map((role, i) => ({
      userId: `b${i}`,
      username: ["바위탑", "갱킹러", "칼날", "카이팅", "그랩"][i],
      assignedRole: role,
    })),
  },
];

function BroadcastControlLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0A0C0F]">
      <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
    </main>
  );
}

function BroadcastControlContent() {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const searchParams = useSearchParams();
  const previewMode =
    process.env.NODE_ENV !== "production" &&
    searchParams?.get("preview") === "1";
  const live = !previewMode && !authLoading && isAuthenticated;

  const [saving, setSaving] = useState(false);
  const [mockView, setMockView] = useState<ControlView>(MOCK_VIEW);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const announcementDirtyRef = useRef(false);

  // ── 서버 상태 ──
  const controlQuery = useQuery({
    queryKey: ["broadcastControl"],
    queryFn: () => broadcastApi.getControl(),
    enabled: live,
    refetchInterval: 2500,
  });
  const tokenQuery = useQuery({
    queryKey: ["broadcastTokenStatus"],
    queryFn: () => broadcastApi.getToken(),
    enabled: live,
    staleTime: 60_000,
  });
  // 미리보기 토큰은 12시간짜리 — 6시간마다 새로 받는다
  const previewTokenQuery = useQuery({
    queryKey: ["broadcastPreviewToken"],
    queryFn: () => broadcastApi.getPreviewToken(),
    enabled: live,
    staleTime: 6 * 60 * 60 * 1000,
    refetchInterval: 6 * 60 * 60 * 1000,
    retry: false,
  });
  const previewToken = previewTokenQuery.data?.token ?? null;
  const view: ControlView | null = previewMode
    ? mockView
    : (controlQuery.data ?? null);
  const roomId = view?.roomId ?? null;

  // 경기 목록 — 방이 있을 때만
  const matchesQuery = useQuery({
    queryKey: ["broadcastControlMatches", roomId],
    queryFn: () => matchApi.getBracket(roomId!),
    enabled: live && Boolean(roomId),
    refetchInterval: 5000,
  });
  const matches: ControlMatch[] = previewMode
    ? MOCK_MATCHES
    : ((matchesQuery.data as ControlMatch[] | undefined) ?? []);

  // 팀·선수 — 오버레이와 같은 스냅샷(미리보기 토큰)에서 받는다
  const snapshotQuery = useQuery({
    queryKey: ["broadcastControlSnapshot", previewToken, roomId],
    queryFn: () =>
      broadcastApi.getSnapshot(previewToken!, { scene: "control" }),
    enabled: live && Boolean(previewToken && roomId),
    refetchInterval: 10_000,
  });
  const teams: any[] = previewMode
    ? MOCK_TEAMS
    : (snapshotQuery.data?.teams ?? []);
  const teamMode: string | null = previewMode
    ? "AUCTION"
    : (snapshotQuery.data?.room?.teamMode ?? null);

  // 공지 프리셋은 방송 설정(커스터마이징)에 같이 저장한다
  const settingsQuery = useQuery({
    queryKey: ["broadcastSettings"],
    queryFn: () => broadcastApi.getSettings(),
    enabled: live,
    staleTime: 60_000,
  });
  const [mockPresets, setMockPresets] = useState<string[]>([
    "잠시 후 경매를 시작합니다.",
    "다음 경기 준비 중입니다.",
  ]);
  const presets = previewMode
    ? mockPresets
    : (settingsQuery.data?.announcementPresets ?? []);

  useEffect(() => {
    if (!announcementDirtyRef.current) {
      setAnnouncementDraft(view?.announcement ?? "");
    }
  }, [view?.announcement]);

  const refreshAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["broadcastControl"] });
    void queryClient.invalidateQueries({
      queryKey: ["broadcastControlMatches"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["broadcastControlSnapshot"],
    });
  }, [queryClient]);

  // ── 조작 ──
  const update = async (patch: BroadcastControlPatch) => {
    setSaving(true);
    try {
      if (previewMode) {
        const { breakMinutes, ...rest } = patch;
        setMockView((prev) => ({
          ...prev,
          ...rest,
          ...(breakMinutes !== undefined
            ? {
                breakEndsAt:
                  breakMinutes == null
                    ? null
                    : new Date(
                        Date.now() + breakMinutes * 60_000,
                      ).toISOString(),
              }
            : {}),
        }));
      } else {
        const res = await broadcastApi.updateControl(patch);
        queryClient.setQueryData(["broadcastControl"], res);
      }
      if (patch.announcement !== undefined) {
        announcementDirtyRef.current = false;
        setAnnouncementDraft(patch.announcement ?? "");
      }
    } catch {
      addToast("방송 조작 변경에 실패했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  const cue = async (
    body:
      | { type: "replay-result" }
      | { type: "player"; userId: string }
      | { type: "clear-player" },
    okMessage?: string,
  ) => {
    if (previewMode) {
      if (okMessage) addToast(okMessage, "success");
      return;
    }
    try {
      await broadcastApi.sendCue(body);
      if (okMessage) addToast(okMessage, "success");
    } catch {
      addToast("송출 중인 방이 없거나 연출을 보낼 수 없습니다.", "error");
    }
  };

  const focusMatch = async (match: ControlMatch) => {
    if (!roomId) return;
    const nextScene: BroadcastControlScene =
      match.status === "COMPLETED" ? "result" : "auto";
    setSaving(true);
    try {
      if (previewMode) {
        setMockView((prev) => ({
          ...prev,
          scene: nextScene,
          focusMatchId: match.id,
        }));
        return;
      }
      await Promise.all([
        broadcastApi.setFocus(roomId, match.id),
        broadcastApi.updateControl({ scene: nextScene }),
      ]);
      refreshAll();
    } catch {
      addToast("중계 경기 변경에 실패했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  const savePresets = async (next: string[]) => {
    if (previewMode) {
      setMockPresets(next);
      return;
    }
    const current = settingsQuery.data;
    if (!current) return;
    try {
      const saved = await broadcastApi.updateSettings({
        ...current,
        announcementPresets: next,
      });
      queryClient.setQueryData(["broadcastSettings"], saved);
    } catch {
      addToast("공지 프리셋 저장에 실패했습니다.", "error");
    }
  };

  // ── 파생 값 ──
  const activeScene = view?.scene ?? "auto";
  const lineupVisible = activeScene === "lineup";
  const roomStatus = view?.room?.status ?? null;
  const recommended = phaseScenes(roomStatus, teamMode);
  const others = ALL_SCENES.filter((s) => !recommended.includes(s));
  const focusedMatch =
    matches.find((match) => match.id === view?.focusMatchId) ?? null;
  const activeLabel =
    activeScene === "lineup"
      ? "라인업 패널"
      : (SCENES[activeScene]?.label ?? "자동");

  const maxRound = useMemo(
    () => Math.max(...matches.map((match) => Number(match.round ?? 0)), 0),
    [matches],
  );
  const stageLabel = (match: ControlMatch) => {
    const section = String(match.bracketRound ?? "");
    if (section === "GF" || section.includes("FINAL")) return "결승";
    if (section === "WB_F") return "승자조 결승";
    if (section === "LB_F") return "패자조 결승";
    if (section.startsWith("WB")) return "승자조";
    if (section.startsWith("LB")) return "패자조";
    const round = Number(match.round ?? 0);
    if (!round || !maxRound) return "경기";
    if (round === maxRound) return "결승";
    if (round === maxRound - 1) return "4강";
    if (round === maxRound - 2) return "8강";
    if (round === maxRound - 3) return "16강";
    return `${round}라운드`;
  };

  const breakEndsAt = view?.breakEndsAt ? Date.parse(view.breakEndsAt) : NaN;
  const now = useNow(Number.isFinite(breakEndsAt));
  const breakLeft = Number.isFinite(breakEndsAt)
    ? Math.max(0, Math.ceil((breakEndsAt - now) / 1000))
    : null;

  if (!previewMode && authLoading) return <BroadcastControlLoading />;

  if (!previewMode && !isAuthenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#0A0C0F] px-4 text-center">
        <MonitorPlay className="h-10 w-10 text-accent-primary" />
        <h1 className="mt-4 text-2xl font-black text-white">
          로그인이 필요합니다
        </h1>
        <p className="mt-2 text-sm text-white/55">
          방송 조작 패널은 본인 방송 오버레이 상태를 바꾸는 화면입니다. 로그인
          후 설정의 방송 탭에서 다시 열어주세요.
        </p>
        <Link
          href="/auth/login"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent-primary px-4 py-2 text-sm font-bold text-accent-on hover:bg-accent-hover"
        >
          로그인으로 이동
        </Link>
      </main>
    );
  }

  if (!previewMode && controlQuery.isLoading) {
    return <BroadcastControlLoading />;
  }

  const onAir = Boolean(view?.room);
  const iframeSrc = previewMode
    ? "/broadcast/sample"
    : previewToken
      ? `/broadcast/${previewToken}?scene=control&bg=opaque&preview=1&fx=low`
      : null;

  return (
    <main className="min-h-screen bg-[#0A0C0F] text-white">
      {/* ── 상단 상태바 ── */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/[0.07] bg-[#0E1115] px-4 py-2.5">
        <span
          className={`flex items-center gap-2 rounded px-2.5 py-1 text-[11px] font-black tracking-[0.18em] ${
            onAir ? "bg-red-600 text-white" : "bg-white/10 text-white/60"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              onAir ? "animate-pulse bg-white" : "bg-white/40"
            }`}
          />
          {onAir ? "ON AIR" : "STANDBY"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black">
            {view?.room?.name ?? "송출 중인 방 없음"}
          </p>
          <p className="text-[11px] font-bold text-white/45">
            {roomStatus
              ? (ROOM_STATUS_KO[roomStatus] ?? roomStatus)
              : "내가 호스트인 방을 만들면 자동으로 연결됩니다"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusChip
            ok={previewMode || Boolean(tokenQuery.data?.exists)}
            label="OBS 링크"
          />
          <StatusChip
            ok={previewMode || Boolean(tokenQuery.data?.controlExists)}
            label="외부 장비"
          />
          <button
            type="button"
            onClick={refreshAll}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-white/60 hover:bg-white/5 hover:text-white"
            title="새로고침"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* ── 왼쪽: 모니터 + 장면 ── */}
        <div className="flex min-w-0 flex-col gap-3">
          <ProgramMonitor
            src={iframeSrc}
            sceneLabel={activeLabel}
            auto={activeScene === "auto"}
            failed={!previewMode && previewTokenQuery.isError}
          />

          <Panel title="지금 단계에 쓸 장면">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
              {recommended.map((scene) => (
                <SceneButton
                  key={scene}
                  def={SCENES[scene]}
                  selected={activeScene === scene}
                  disabled={saving}
                  large
                  onClick={() => update({ scene })}
                />
              ))}
            </div>
            <p className="mb-2 mt-3 text-[11px] font-bold text-white/40">
              다른 장면
            </p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 xl:grid-cols-7">
              {others.map((scene) => (
                <SceneButton
                  key={scene}
                  def={SCENES[scene]}
                  selected={activeScene === scene}
                  disabled={saving}
                  onClick={() => update({ scene })}
                />
              ))}
            </div>
          </Panel>

          <Panel
            title="중계 경기"
            right={
              <span className="text-[11px] font-bold text-white/40">
                {matches.length}경기
              </span>
            }
          >
            {roomId && matches.length > 0 ? (
              <div className="grid max-h-60 gap-1.5 overflow-y-auto pr-1">
                {matches.map((match) => {
                  const focused = view?.focusMatchId === match.id;
                  const status = MATCH_STATUS_KO[match.status] ?? {
                    label: match.status,
                    tone: "text-white/45 bg-white/5",
                  };
                  return (
                    <div
                      key={match.id}
                      className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2 ${
                        focused
                          ? "border-red-500/60 bg-red-500/[0.07]"
                          : "border-white/[0.06] bg-white/[0.02]"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[11px] font-bold text-white/45">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-black ${status.tone}`}
                          >
                            {status.label}
                          </span>
                          {stageLabel(match)}
                          {match.matchNumber != null &&
                            ` · ${match.matchNumber}경기`}
                        </p>
                        <p className="mt-0.5 truncate text-sm font-black">
                          {match.teamA?.name ?? "TBD"}
                          <span className="mx-1.5 text-white/30">vs</span>
                          {match.teamB?.name ?? "TBD"}
                        </p>
                      </div>
                      {focused ? (
                        <span className="rounded bg-red-600 px-2.5 py-1 text-[11px] font-black">
                          중계 중
                        </span>
                      ) : (
                        <ConsoleButton
                          onClick={() => focusMatch(match)}
                          disabled={saving}
                        >
                          {match.status === "COMPLETED"
                            ? "결과 보기"
                            : "이 경기 중계"}
                        </ConsoleButton>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-md bg-white/[0.02] px-3 py-3 text-xs font-bold text-white/40">
                활성 방의 대진표가 생성되면 중계할 경기를 고를 수 있습니다.
              </p>
            )}
          </Panel>
        </div>

        {/* ── 오른쪽: 즉석 연출 ── */}
        <aside className="flex min-w-0 flex-col gap-3">
          <Panel title="즉석 연출">
            <div className="grid grid-cols-2 gap-1.5">
              <ActionButton
                icon={RotateCcw}
                label="결과 다시 보기"
                hint={
                  focusedMatch?.status === "COMPLETED"
                    ? "처음부터 재생"
                    : "끝난 경기를 먼저 고르세요"
                }
                disabled={saving || focusedMatch?.status !== "COMPLETED"}
                onClick={async () => {
                  if (activeScene !== "result")
                    await update({ scene: "result" });
                  await cue(
                    { type: "replay-result" },
                    "결과 연출을 다시 재생합니다.",
                  );
                }}
              />
              <ToggleButton
                label="라인업 패널"
                hint="밴픽 중 선수 표시"
                on={lineupVisible}
                disabled={saving || !focusedMatch}
                onClick={() =>
                  update({ scene: lineupVisible ? "auto" : "lineup" })
                }
              />
              <ToggleButton
                label="하단 정보바"
                hint="방 제목 · 인원"
                on={view?.lowerThirdVisible !== false}
                disabled={saving}
                onClick={() =>
                  update({
                    lowerThirdVisible: !(view?.lowerThirdVisible ?? true),
                  })
                }
              />
              <ActionButton
                icon={X}
                label="선수 카드 내리기"
                hint="띄운 카드 즉시 닫기"
                disabled={!roomId}
                onClick={() => cue({ type: "clear-player" })}
              />
            </div>
          </Panel>

          <Panel
            title="휴식 카운트다운"
            right={
              breakLeft != null && activeScene === "break" ? (
                <span className="font-mono text-sm font-black tabular-nums text-amber-300">
                  {breakLeft > 0 ? formatClock(breakLeft) : "재개 대기"}
                </span>
              ) : null
            }
          >
            <div className="grid grid-cols-5 gap-1.5">
              {BREAK_MINUTES.map((minutes) => (
                <ConsoleButton
                  key={minutes}
                  disabled={saving}
                  onClick={() =>
                    update({ scene: "break", breakMinutes: minutes })
                  }
                >
                  {minutes}분
                </ConsoleButton>
              ))}
              <ConsoleButton
                disabled={saving || breakLeft == null}
                onClick={() => update({ breakMinutes: null })}
                muted
              >
                끄기
              </ConsoleButton>
            </div>
            <p className="mt-2 text-[11px] text-white/40">
              누르면 휴식 화면으로 바뀌고 남은 시간이 뜹니다. 끝나면 &ldquo;곧
              재개합니다&rdquo;로 바뀌고, 장면은 직접 넘기세요.
            </p>
          </Panel>

          <Panel title="선수 카드">
            {teams.length > 0 ? (
              <div className="grid max-h-64 gap-2 overflow-y-auto pr-1">
                {teams.map((team) => (
                  <div key={team.id}>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-black text-white/60">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: team.color ?? "#888" }}
                      />
                      {team.name}
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {(team.members ?? []).map((member: any) => (
                        <button
                          key={member.userId}
                          type="button"
                          onClick={() =>
                            cue(
                              { type: "player", userId: member.userId },
                              `${member.username ?? "선수"} 카드를 12초간 띄웁니다.`,
                            )
                          }
                          className="flex min-w-0 items-center gap-1.5 rounded bg-white/[0.04] px-2 py-1.5 text-left text-xs font-bold hover:bg-white/[0.09]"
                        >
                          <UserRound className="h-3.5 w-3.5 shrink-0 text-white/35" />
                          <span className="truncate">
                            {member.username ?? "선수"}
                          </span>
                          {member.assignedRole && (
                            <span className="ml-auto shrink-0 text-[10px] text-white/35">
                              {ROLE_KO[member.assignedRole] ??
                                member.assignedRole}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs font-bold text-white/40">
                팀이 정해지면 선수를 눌러 방송에 카드를 띄울 수 있습니다.
              </p>
            )}
          </Panel>

          <Panel title="공지 문구">
            <textarea
              value={announcementDraft}
              onChange={(event) => {
                announcementDirtyRef.current = true;
                setAnnouncementDraft(event.target.value);
              }}
              maxLength={BROADCAST_ANNOUNCEMENT_MAX}
              rows={2}
              className="w-full resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-accent-primary"
              placeholder="화면 위쪽에 뜨는 짧은 안내"
            />
            <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-1.5">
              <ConsoleButton
                primary
                disabled={saving}
                onClick={() => update({ announcement: announcementDraft })}
              >
                띄우기
              </ConsoleButton>
              <ConsoleButton
                muted
                disabled={saving || !view?.announcement}
                onClick={() => update({ announcement: null })}
              >
                내리기
              </ConsoleButton>
              <ConsoleButton
                muted
                title="지금 문구를 프리셋으로 저장"
                disabled={
                  !announcementDraft.trim() ||
                  presets.includes(announcementDraft.trim()) ||
                  presets.length >= BROADCAST_ANNOUNCEMENT_PRESET_MAX
                }
                onClick={() =>
                  savePresets([...presets, announcementDraft.trim()])
                }
              >
                <Plus className="h-3.5 w-3.5" />
              </ConsoleButton>
            </div>
            {view?.announcement && (
              <p className="mt-2 truncate text-[11px] font-bold text-red-300">
                ● 송출 중: {view.announcement}
              </p>
            )}
            {presets.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {presets.map((preset) => (
                  <div
                    key={preset}
                    className="group flex items-center gap-1 rounded bg-white/[0.04]"
                  >
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => update({ announcement: preset })}
                      className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs font-bold hover:text-accent-primary"
                    >
                      {preset}
                    </button>
                    <button
                      type="button"
                      title="프리셋 삭제"
                      onClick={() =>
                        savePresets(presets.filter((item) => item !== preset))
                      }
                      className="px-2 text-white/25 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </main>
  );
}

/** 1초마다 갱신되는 현재 시각 (켜져 있을 때만) */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function formatClock(seconds: number) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * PROGRAM 모니터 — 1920×1080 오버레이를 상자 너비에 맞춰 축소해 띄운다.
 * 클릭은 막는다(보기 전용). 소리는 오버레이 쪽에서 preview=1 로 끈다.
 */
function ProgramMonitor({
  src,
  sceneLabel,
  auto,
  failed,
}: {
  src: string | null;
  sceneLabel: string;
  auto: boolean;
  failed: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / 1920);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="overflow-hidden rounded-lg border border-white/[0.08] bg-black">
      <div className="flex items-center gap-2 border-b border-white/[0.07] bg-[#111418] px-3 py-1.5">
        <span className="rounded-sm bg-red-600 px-1.5 py-0.5 text-[10px] font-black tracking-[0.16em]">
          PROGRAM
        </span>
        <span className="text-xs font-black">{sceneLabel}</span>
        {auto && (
          <span className="text-[11px] font-bold text-white/40">
            · 방 상태를 따라 자동 전환
          </span>
        )}
      </div>
      <div
        ref={boxRef}
        className="relative w-full overflow-hidden"
        style={{ aspectRatio: "16 / 9" }}
      >
        {src ? (
          <iframe
            src={src}
            title="송출 미리보기"
            className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
            style={{
              width: 1920,
              height: 1080,
              transform: `scale(${scale})`,
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white/35">
            {failed ? "미리보기를 불러오지 못했습니다" : "미리보기 준비 중…"}
          </div>
        )}
      </div>
    </section>
  );
}

function Panel({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-white/[0.07] bg-[#111418] p-3">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-black uppercase tracking-[0.14em] text-white/55">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function SceneButton({
  def,
  selected,
  disabled,
  large,
  onClick,
}: {
  def: SceneDef;
  selected: boolean;
  disabled?: boolean;
  large?: boolean;
  onClick: () => void;
}) {
  const Icon = def.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative rounded-md border text-left transition disabled:opacity-50 ${
        large ? "min-h-[74px] p-2.5" : "px-2 py-1.5"
      } ${
        selected
          ? "border-red-500 bg-red-600/20 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.6)]"
          : "border-white/[0.07] bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
      }`}
    >
      {selected && (
        <span className="absolute right-1.5 top-1.5 rounded-sm bg-red-600 px-1 text-[9px] font-black tracking-wider">
          LIVE
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <Icon
          className={`${large ? "h-4 w-4" : "h-3.5 w-3.5"} shrink-0 ${
            selected ? "text-red-300" : "text-white/40"
          }`}
        />
        <span className={`${large ? "text-sm" : "text-xs"} font-black`}>
          {def.label}
        </span>
      </span>
      {large && (
        <span className="mt-1 block text-[11px] leading-snug text-white/40">
          {def.description}
        </span>
      )}
    </button>
  );
}

function ConsoleButton({
  children,
  onClick,
  disabled,
  primary,
  muted,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  muted?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-35 ${
        primary
          ? "bg-accent-primary text-accent-on hover:bg-accent-hover"
          : muted
            ? "bg-white/[0.04] text-white/60 hover:bg-white/[0.08]"
            : "bg-white/[0.08] text-white hover:bg-white/[0.14]"
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({
  icon: Icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: typeof MonitorPlay;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 text-left transition hover:border-white/25 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="flex items-center gap-1.5 text-xs font-black">
        <Icon className="h-3.5 w-3.5 text-white/50" />
        {label}
      </span>
      <span className="mt-1 block text-[10px] leading-snug text-white/40">
        {hint}
      </span>
    </button>
  );
}

function ToggleButton({
  label,
  hint,
  on,
  disabled,
  onClick,
}: {
  label: string;
  hint: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border p-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
        on
          ? "border-red-500/70 bg-red-600/15"
          : "border-white/[0.07] bg-white/[0.03] hover:border-white/25"
      }`}
    >
      <span className="flex items-center justify-between gap-1.5 text-xs font-black">
        {label}
        {on ? (
          <Eye className="h-3.5 w-3.5 text-red-300" />
        ) : (
          <EyeOff className="h-3.5 w-3.5 text-white/35" />
        )}
      </span>
      <span className="mt-1 block text-[10px] leading-snug text-white/40">
        {hint}
      </span>
    </button>
  );
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`hidden items-center gap-1.5 rounded px-2 py-1 text-[11px] font-bold sm:flex ${
        ok ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-white/40"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-white/30"}`}
      />
      {label} {ok ? "켜짐" : "없음"}
    </span>
  );
}

export default function BroadcastControlPage() {
  return (
    <Suspense fallback={<BroadcastControlLoading />}>
      <BroadcastControlContent />
    </Suspense>
  );
}
