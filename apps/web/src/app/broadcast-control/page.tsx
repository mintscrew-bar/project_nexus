"use client";

import { useEffect, useMemo, useState } from "react";
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
  type BroadcastControlScene,
  type BroadcastControlState,
} from "@/lib/api-client";
import { Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

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

export default function BroadcastControlPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState<
    (BroadcastControlState & { roomId: string | null }) | null
  >(null);
  const [announcementDraft, setAnnouncementDraft] = useState("");

  const activeScene = state?.scene ?? "auto";
  const activeLabel = useMemo(
    () => SCENES.find((item) => item.scene === activeScene)?.label ?? "자동",
    [activeScene],
  );

  const load = async () => {
    setLoading(true);
    try {
      const res = await broadcastApi.getControl();
      setState(res);
      setAnnouncementDraft(res.announcement ?? "");
    } catch {
      addToast("방송 조작 상태를 불러오지 못했습니다.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = async (patch: Partial<BroadcastControlState>) => {
    setSaving(true);
    try {
      const res = await broadcastApi.updateControl(patch);
      setState(res);
      if (patch.announcement !== undefined) {
        setAnnouncementDraft(res.announcement ?? "");
      }
    } catch {
      addToast("방송 조작 변경에 실패했습니다.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent-primary" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-accent-primary">
            Broadcast Control
          </p>
          <h1 className="mt-2 text-3xl font-black text-text-primary">
            방송 조작 패널
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            OBS에는 컨트롤 UI를 넣지 않고, 이 화면에서 출력 장면만 제어합니다.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={saving}>
          <RefreshCw className="mr-2 h-4 w-4" />
          새로고침
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-bg-elevated bg-bg-secondary p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-text-secondary">현재 장면</p>
              <p className="mt-1 text-2xl font-black text-text-primary">
                {activeLabel}
              </p>
            </div>
            <div className="rounded-md border border-bg-elevated px-3 py-2 text-right">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-text-tertiary">
                Room
              </p>
              <p className="mt-1 text-sm font-bold text-text-primary">
                {state?.roomId ? "연동됨" : "대기"}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SCENES.map((item) => {
              const Icon = item.icon;
              const selected = item.scene === activeScene;
              return (
                <button
                  key={item.scene}
                  type="button"
                  onClick={() => update({ scene: item.scene })}
                  disabled={saving}
                  className={`min-h-[88px] rounded-lg border p-4 text-left transition ${
                    selected
                      ? "border-accent-primary bg-accent-primary/12"
                      : "border-bg-elevated bg-bg-tertiary hover:border-text-tertiary"
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center gap-3">
                    <Icon
                      className={`h-5 w-5 ${
                        selected ? "text-accent-primary" : "text-text-tertiary"
                      }`}
                    />
                    <span className="text-base font-black text-text-primary">
                      {item.label}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-text-tertiary">
                    {item.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rounded-lg border border-bg-elevated bg-bg-secondary p-5">
          <p className="text-sm font-bold text-text-secondary">출력 옵션</p>

          <button
            type="button"
            onClick={() =>
              update({ lowerThirdVisible: !state?.lowerThirdVisible })
            }
            disabled={saving}
            className="mt-4 flex w-full items-center justify-between rounded-lg border border-bg-elevated bg-bg-tertiary px-4 py-3 text-left disabled:opacity-50"
          >
            <span>
              <span className="block text-sm font-bold text-text-primary">
                하단 정보바
              </span>
              <span className="text-xs text-text-tertiary">
                방송 제목/인원 표시
              </span>
            </span>
            {state?.lowerThirdVisible ? (
              <Eye className="h-5 w-5 text-accent-primary" />
            ) : (
              <EyeOff className="h-5 w-5 text-text-tertiary" />
            )}
          </button>

          <div className="mt-5">
            <label className="text-sm font-bold text-text-secondary">
              공지 문구
            </label>
            <textarea
              value={announcementDraft}
              onChange={(event) => setAnnouncementDraft(event.target.value)}
              maxLength={80}
              rows={3}
              className="mt-2 w-full resize-none rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
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
