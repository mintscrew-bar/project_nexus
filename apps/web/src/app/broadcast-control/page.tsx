"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BadgeInfo,
  Eye,
  EyeOff,
  Gamepad2,
  Gavel,
  ListTree,
  Loader2,
  MonitorPlay,
  Pause,
  Radio,
  RefreshCw,
  Swords,
  Users,
} from "lucide-react";
import {
  broadcastApi,
  type BroadcastControlRoom,
  type BroadcastControlScene,
  type BroadcastControlState,
} from "@/lib/api-client";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useAuthStore } from "@/stores/auth-store";
import { openBroadcastControlWindow } from "@/lib/open-broadcast-control";

const SCENES: Array<{
  scene: BroadcastControlScene;
  label: string;
  description: string;
  icon: typeof MonitorPlay;
}> = [
  {
    scene: "auto",
    label: "자동",
    description: "방 상태를 따라갑니다",
    icon: MonitorPlay,
  },
  {
    scene: "idle",
    label: "대기",
    description: "방송 대기 화면",
    icon: Pause,
  },
  {
    scene: "room",
    label: "로비",
    description: "참가자 대기",
    icon: Users,
  },
  {
    scene: "auction",
    label: "경매",
    description: "라이브 경매판",
    icon: Gavel,
  },
  {
    scene: "role-selection",
    label: "역할 선택",
    description: "포지션 선택 현황",
    icon: Gamepad2,
  },
  {
    scene: "bracket",
    label: "대진표",
    description: "토너먼트 보드",
    icon: ListTree,
  },
  {
    scene: "match",
    label: "경기",
    description: "포커스 매치",
    icon: Swords,
  },
  {
    scene: "result",
    label: "결과",
    description: "경기 결과",
    icon: BadgeInfo,
  },
  {
    scene: "break",
    label: "휴식",
    description: "브레이크 화면",
    icon: Radio,
  },
];

function BroadcastControlLoading() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
    </main>
  );
}

function BroadcastControlContent() {
  const { addToast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const searchParams = useSearchParams();
  const previewMode =
    process.env.NODE_ENV !== "production" && searchParams?.get("preview") === "1";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<
    (BroadcastControlState & {
      roomId: string | null;
      room: BroadcastControlRoom | null;
    }) | null
  >(null);
  const [tokenState, setTokenState] = useState<{
    exists: boolean;
    controlExists: boolean;
    createdAt: string | null;
    controlCreatedAt: string | null;
  } | null>(null);
  const [announcementDraft, setAnnouncementDraft] = useState("");
  const announcementDirtyRef = useRef(false);

  const previewState = useMemo<
    BroadcastControlState & {
      roomId: string | null;
      room: BroadcastControlRoom | null;
    }
  >(
    () => ({
      scene: "auction",
      lowerThirdVisible: true,
      announcement: "잠시 후 경매를 시작합니다.",
      roomId: "preview-room",
      room: {
        id: "preview-room",
        name: "제1회 넥서스 내전 리그",
        status: "AUCTION",
      },
    }),
    [],
  );
  const displayState = previewMode ? state ?? previewState : state;

  const activeScene = displayState?.scene ?? "auto";
  const activeLabel = useMemo(
    () => SCENES.find((item) => item.scene === activeScene)?.label ?? "자동",
    [activeScene],
  );

  const load = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const [res, token] = await Promise.all([
        broadcastApi.getControl(),
        broadcastApi.getToken(),
      ]);
      setState(res);
      setTokenState(token);
      if (!announcementDirtyRef.current) {
        setAnnouncementDraft(res.announcement ?? "");
      }
    } catch {
      if (!options?.silent) {
        addToast("방송 조작 상태를 불러오지 못했습니다.", "error");
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (previewMode) {
      setState(previewState);
      setAnnouncementDraft(previewState.announcement ?? "");
      return;
    }
    if (previewMode || authLoading || !isAuthenticated) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMode, authLoading, isAuthenticated, previewState]);

  useEffect(() => {
    if (previewMode || authLoading || !isAuthenticated) return;
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, 2500);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated]);

  const update = async (patch: Partial<BroadcastControlState>) => {
    setSaving(true);
    try {
      if (previewMode) {
        setState((prev) => ({
          ...(prev ?? previewState),
          ...patch,
          roomId: previewState.roomId,
          room: previewState.room,
        }));
        if (patch.announcement !== undefined) {
          announcementDirtyRef.current = false;
          setAnnouncementDraft(patch.announcement ?? "");
        }
        return;
      }
      const res = await broadcastApi.updateControl(patch);
      setState(res);
      if (patch.announcement !== undefined) {
        announcementDirtyRef.current = false;
        setAnnouncementDraft(res.announcement ?? "");
      }
    } catch {
      addToast("방송 조작 변경에 실패했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!previewMode && (authLoading || (isAuthenticated && loading))) {
    return (
      <BroadcastControlLoading />
    );
  }

  if (!previewMode && !isAuthenticated) {
    return (
      <main className="mx-auto flex min-h-[70vh] w-full max-w-xl flex-col items-center justify-center px-4 text-center">
        <MonitorPlay className="h-10 w-10 text-accent-primary" />
        <h1 className="mt-4 text-2xl font-black text-text-primary">
          로그인이 필요합니다
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          방송 조작 패널은 본인 방송 오버레이 상태를 바꾸는 화면입니다.
          로그인 후 설정의 방송 탭에서 다시 열어주세요.
        </p>
        <a
          href="/auth/login"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent-primary px-4 py-2 text-sm font-bold text-white hover:bg-accent-hover"
        >
          로그인으로 이동
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 px-3 py-2.5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent-primary">
            Broadcast Control
          </p>
          <h1 className="mt-1 text-2xl font-black text-text-primary">
            방송 조작 패널
          </h1>
          <p className="mt-1 text-xs text-text-secondary">
            OBS에는 컨트롤 UI를 넣지 않고, 이 화면에서 출력 장면만 제어합니다.
          </p>
        </div>
        {previewMode ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => openBroadcastControlWindow("/broadcast-control?preview=1")}
          >
            팝업으로 보기
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => void load()} disabled={saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        )}
      </header>

      <section className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-bg-elevated bg-bg-secondary px-3 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-tertiary">
            OBS Source
          </p>
          <p className="mt-1 text-xs font-bold text-text-primary">
            {previewMode || tokenState?.exists ? "방송 토큰 활성" : "방송 토큰 없음"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
            {previewMode
              ? "프리뷰 모드"
              : tokenState?.createdAt
              ? `${new Date(tokenState.createdAt).toLocaleDateString("ko-KR")} 발급`
              : "설정에서 OBS 링크 발급 필요"}
          </p>
        </div>
        <div className="rounded-lg border border-bg-elevated bg-bg-secondary px-3 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-tertiary">
            External Control
          </p>
          <p className="mt-1 text-xs font-bold text-text-primary">
            {previewMode || tokenState?.controlExists ? "외부 조작 토큰 활성" : "외부 조작 토큰 없음"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
            Stream Deck·Ulanzi 연동
          </p>
        </div>
        <div className="rounded-lg border border-bg-elevated bg-bg-secondary px-3 py-2.5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-tertiary">
            Active Room
          </p>
          <p className="mt-1 truncate text-xs font-bold text-text-primary">
            {displayState?.room?.name ?? "연동된 방 없음"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-text-tertiary">
            {displayState?.room ? displayState.room.status : "활성 방 자동 추적"}
          </p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-[1fr_260px]">
        <div className="rounded-lg border border-bg-elevated bg-bg-secondary p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-text-secondary">현재 장면</p>
              <p className="mt-0.5 text-xl font-black text-text-primary">
                {activeLabel}
              </p>
            </div>
            <div className="rounded-md border border-bg-elevated px-2.5 py-1.5 text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-tertiary">
                Room
              </p>
              <p className="mt-0.5 text-xs font-bold text-text-primary">
                {displayState?.room ? "연동됨" : "대기"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {SCENES.map((item) => {
              const Icon = item.icon;
              const selected = item.scene === activeScene;
              return (
                <button
                  key={item.scene}
                  type="button"
                  onClick={() => update({ scene: item.scene })}
                  disabled={saving}
                  className={`min-h-[72px] rounded-lg border p-2.5 text-left transition ${
                    selected
                      ? "border-accent-primary bg-accent-primary/12"
                      : "border-bg-elevated bg-bg-tertiary hover:border-text-tertiary"
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      className={`h-4 w-4 ${
                        selected ? "text-accent-primary" : "text-text-tertiary"
                      }`}
                    />
                    <span className="text-sm font-black text-text-primary">
                      {item.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-snug text-text-tertiary">
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-lg border border-bg-elevated bg-bg-secondary p-3">
          <p className="text-xs font-bold text-text-secondary">출력 옵션</p>

          <button
            type="button"
            onClick={() =>
              update({ lowerThirdVisible: !displayState?.lowerThirdVisible })
            }
            disabled={saving}
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2.5 text-left disabled:opacity-50"
          >
            <span>
              <span className="block text-xs font-bold text-text-primary">
                하단 정보바
              </span>
              <span className="text-[11px] text-text-tertiary">
                방송 제목/인원 표시
              </span>
            </span>
            {displayState?.lowerThirdVisible ? (
              <Eye className="h-5 w-5 text-accent-primary" />
            ) : (
              <EyeOff className="h-5 w-5 text-text-tertiary" />
            )}
          </button>

          <div className="mt-4">
            <label className="text-xs font-bold text-text-secondary">
              공지 문구
            </label>
            <textarea
              value={announcementDraft}
              onChange={(event) => {
                announcementDirtyRef.current = true;
                setAnnouncementDraft(event.target.value);
              }}
              maxLength={80}
              rows={3}
              className="mt-2 w-full resize-none rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2 text-xs text-text-primary outline-none focus:border-accent-primary"
              placeholder="짧은 안내 문구"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                size="sm"
                onClick={() => update({ announcement: announcementDraft })}
                disabled={saving}
              >
                적용
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => update({ announcement: null })}
                disabled={saving}
              >
                지우기
              </Button>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

export default function BroadcastControlPage() {
  return (
    <Suspense fallback={<BroadcastControlLoading />}>
      <BroadcastControlContent />
    </Suspense>
  );
}
