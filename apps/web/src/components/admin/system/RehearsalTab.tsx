"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square, AlertTriangle, CheckCircle2 } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { Button, Card, CardContent } from "@/components/ui";

/**
 * 경매 리허설 탭.
 *
 * 2026-08-11 20인 경매방이 무너진 경로를 운영에서 그대로 재현한다.
 * 진행 상황은 status 를 1초마다 다시 물어 따라간다 — 리허설은 한 번에 하나만
 * 돌고 이 화면에서만 보므로 전용 소켓을 새로 열 이유가 없다.
 */

interface RehearsalView {
  id: string;
  phase: "SETUP" | "STARTING" | "RUNNING" | "DONE" | "FAILED";
  mode: "light" | "full";
  count: number;
  roomId: string | null;
  startedAt: string;
  finishedAt: string | null;
  items: number;
  sold: number;
  unsold: number;
  violations: string[];
  logs: string[];
  error: string | null;
  socketCount: number;
  socketFolds: number;
  droppedAtItem: number | null;
  itemsAfterDrop: number;
  reconnectRestored: boolean;
}

interface RehearsalStatus {
  running: boolean;
  enabled: boolean;
  run: RehearsalView | null;
}

const PHASE_LABEL: Record<RehearsalView["phase"], string> = {
  SETUP: "준비 중",
  STARTING: "경매 시작 중",
  RUNNING: "진행 중",
  DONE: "완료",
  FAILED: "실패",
};

export function RehearsalTab({
  addToast,
}: {
  addToast: (message: string, type?: "success" | "error" | "info") => void;
}) {
  const [status, setStatus] = useState<RehearsalStatus | null>(null);
  const [count, setCount] = useState(20);
  const [mode, setMode] = useState<"light" | "full">("full");
  const [bidTime, setBidTime] = useState(20);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await adminApi.getRehearsalStatus());
    } catch {
      // 폴링 실패는 조용히 넘긴다 — 다음 주기에 다시 묻는다.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 돌고 있을 때만 짧은 주기로 따라간다. 멈춰 있으면 굳이 두드리지 않는다.
  useEffect(() => {
    if (!status?.running) return;
    const timer = setInterval(() => void refresh(), 1000);
    return () => clearInterval(timer);
  }, [status?.running, refresh]);

  // 새 줄이 쌓이면 로그를 아래로 따라 내린다.
  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [status?.run?.logs?.length]);

  const start = async () => {
    setBusy(true);
    try {
      await adminApi.startRehearsal({
        count,
        mode,
        bidTimeSeconds: bidTime,
      });
      addToast("리허설을 시작했습니다.", "success");
      await refresh();
    } catch (error: any) {
      addToast(
        error?.response?.data?.message || "리허설을 시작하지 못했습니다.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const abort = async () => {
    setBusy(true);
    try {
      await adminApi.abortRehearsal();
      addToast("중단을 요청했습니다.", "info");
      await refresh();
    } catch (error: any) {
      addToast(
        error?.response?.data?.message || "중단하지 못했습니다.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const run = status?.run ?? null;
  const running = !!status?.running;

  return (
    <div className="space-y-4">
      {!status?.enabled && (
        <Card>
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-accent-warning" />
            <div className="text-sm">
              <p className="font-semibold text-text-primary">
                리허설이 꺼져 있습니다
              </p>
              <p className="mt-1 text-text-secondary">
                서버에 <code>ENABLE_LOAD_REHEARSAL=1</code> 을 넣고 API 를 다시
                시작해야 실행할 수 있습니다. 운영에 부하를 거는 기능이라 기본은
                꺼짐입니다.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 py-4">
          <div>
            <h2 className="text-lg font-bold text-text-primary">경매 리허설</h2>
            <p className="mt-1 text-sm text-text-secondary">
              봇으로 방을 채워 경매를 끝까지 돌립니다. 방은 목록에 뜨지 않고,
              끝나면 자동으로 지워집니다. 최근 15분 내 접속한 실유저가 있으면
              시작이 거부됩니다.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-text-secondary">
                정원
              </span>
              <select
                value={count}
                onChange={(event) => setCount(Number(event.target.value))}
                disabled={running}
                className="w-full rounded-lg border border-bg-tertiary bg-bg-secondary px-3 py-2 text-text-primary"
              >
                {[10, 15, 20, 30, 40].map((value) => (
                  <option key={value} value={value}>
                    {value}인
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-text-secondary">
                모드
              </span>
              <select
                value={mode}
                onChange={(event) =>
                  setMode(event.target.value as "light" | "full")
                }
                disabled={running}
                className="w-full rounded-lg border border-bg-tertiary bg-bg-secondary px-3 py-2 text-text-primary"
              >
                <option value="full">전체 (소켓 + 팀장 낙오)</option>
                <option value="light">가벼움 (서버 자동입찰만)</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block font-medium text-text-secondary">
                매물당 입찰 시간 (초)
              </span>
              <input
                type="number"
                min={15}
                max={120}
                value={bidTime}
                onChange={(event) => setBidTime(Number(event.target.value))}
                disabled={running}
                className="w-full rounded-lg border border-bg-tertiary bg-bg-secondary px-3 py-2 text-text-primary"
              />
              <span className="mt-1 block text-[11px] text-text-muted">
                15초 미만은 막아둡니다 — 서버 봇 입찰기가 매물 시간 안에
                움직이지 못해 전부 유찰로 끝납니다.
              </span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={start}
              disabled={busy || running || !status?.enabled}
            >
              <Play className="mr-1.5 h-4 w-4" />
              리허설 시작
            </Button>
            {running && (
              <Button variant="secondary" onClick={abort} disabled={busy}>
                <Square className="mr-1.5 h-4 w-4" />
                중단
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {run && (
        <Card>
          <CardContent className="space-y-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-bg-tertiary px-3 py-1 text-xs font-bold text-text-primary">
                {PHASE_LABEL[run.phase]}
              </span>
              <span className="text-xs text-text-muted">
                {run.mode === "full" ? "전체" : "가벼움"} · {run.count}인
              </span>
              {run.roomId && (
                <span className="font-mono text-xs text-text-muted">
                  {run.roomId}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <Stat label="매물" value={run.items} />
              <Stat label="낙찰" value={run.sold} />
              <Stat label="유찰" value={run.unsold} />
              <Stat label="소켓" value={run.socketCount} />
              <Stat
                label="소켓 포기"
                value={run.socketFolds}
                warn={
                  run.mode === "full" && run.items > 4 && run.socketFolds === 0
                }
              />
              <Stat
                label="낙오 후 진행"
                value={run.droppedAtItem == null ? "-" : run.itemsAfterDrop}
                warn={run.droppedAtItem != null && run.itemsAfterDrop === 0}
              />
            </div>

            {run.phase === "DONE" && run.violations.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-accent-success/40 bg-accent-success/10 px-3 py-2 text-sm text-text-primary">
                <CheckCircle2 className="h-4 w-4 text-accent-success" />
                위반 없이 끝났습니다.
              </div>
            )}

            {run.violations.length > 0 && (
              <div className="space-y-1 rounded-lg border border-accent-danger/40 bg-accent-danger/10 px-3 py-2">
                <p className="text-sm font-semibold text-accent-danger">
                  위반 {run.violations.length}건
                </p>
                {run.violations.map((violation, index) => (
                  <p key={index} className="text-sm text-text-primary">
                    ✗ {violation}
                  </p>
                ))}
              </div>
            )}

            {run.error && (
              <p className="rounded-lg border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-sm text-accent-danger">
                {run.error}
              </p>
            )}

            <div>
              <p className="mb-1 text-xs font-medium text-text-muted">
                진행 로그
              </p>
              <div
                ref={logRef}
                className="max-h-64 overflow-y-auto rounded-lg bg-bg-primary p-3 font-mono text-xs leading-relaxed text-text-secondary"
              >
                {run.logs.length === 0 ? (
                  <p className="text-text-muted">아직 기록이 없습니다.</p>
                ) : (
                  run.logs.map((line, index) => <div key={index}>{line}</div>)
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number | string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg bg-bg-secondary px-3 py-2">
      <p className="text-[10px] font-medium text-text-muted">{label}</p>
      <p
        className={`text-lg font-bold tabular-nums ${
          warn ? "text-accent-danger" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
