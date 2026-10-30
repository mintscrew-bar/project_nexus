"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  adminApi,
  type CaptureOcrJob,
  type CaptureOcrScoreboard,
  type CaptureOcrStatus,
} from "@/lib/api-client";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  LoadingSpinner,
} from "@/components/ui";
import { ImageUp, RefreshCw, ScanText } from "lucide-react";
import type { AddToast } from "../shared";

/**
 * 결과창 캡처 인식 실험. ADMIN 전용.
 *
 * 토너먼트 코드 없이 연 내전은 Riot 이 개인 기록을 주지 않는다. 게임 종료 후
 * 결과창 캡처를 로컬 비전 모델(Ollama)로 읽어 KDA·CS·골드를 채울 수 있는지
 * 정확도와 속도를 재 보는 화면이다. 결과는 저장하지 않는다.
 *
 * 분석이 수십 초 걸려(Cloudflare 100초 제한) 요청은 작업 ID 만 받고 결과는 폴링한다.
 */

// 결과 폴링 주기
const POLL_MS = 2000;

interface RunRecord {
  job: CaptureOcrJob;
  fileName: string;
  previewUrl: string;
}

export function CaptureOcrTab({ addToast }: { addToast: AddToast }) {
  const [status, setStatus] = useState<CaptureOcrStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [model, setModel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [running, setRunning] = useState<CaptureOcrJob | null>(null);
  // 분석을 시작한 시점의 파일 — 도중에 다른 캡처를 골라도 결과에 엉뚱한 이름이 붙지 않게
  const runningMetaRef = useRef<{ fileName: string; previewUrl: string }>({
    fileName: "",
    previewUrl: "",
  });
  // 같은 캡처로 모델을 바꿔 가며 비교할 수 있게 이번 세션의 결과를 쌓아 둔다
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const next = await adminApi.getCaptureOcrStatus();
      setStatus(next);
      // 고른 모델이 없으면 기본 모델(설치돼 있을 때) → 첫 번째 모델 순으로 고른다
      setModel((prev) => {
        if (prev && next.models.some((m) => m.name === prev)) return prev;
        if (next.models.some((m) => m.name === next.defaultModel))
          return next.defaultModel;
        return next.models[0]?.name ?? "";
      });
    } catch {
      addToast("캡처 인식 상태 로드 실패", "error");
    } finally {
      setStatusLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const pickFile = useCallback(
    (next: File | null) => {
      if (next && !next.type.startsWith("image/")) {
        addToast("이미지 파일만 올릴 수 있습니다.", "error");
        return;
      }
      setFile(next);
      setPreviewUrl(next ? URL.createObjectURL(next) : null);
    },
    [addToast],
  );

  // 캡처 직후 Ctrl+V 로 바로 붙여 넣을 수 있게 한다 (Win+Shift+S → 붙여넣기)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      const pasted = item?.getAsFile();
      if (pasted) pickFile(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pickFile]);

  // 진행 중인 작업을 폴링한다
  useEffect(() => {
    if (!running || running.status !== "running") return;
    const timer = setTimeout(async () => {
      try {
        const next = await adminApi.getCaptureOcrJob(running.id);
        setRunning(next);
        if (next.status !== "running") {
          setRuns((prev) => [
            { job: next, ...runningMetaRef.current },
            ...prev,
          ]);
          if (next.status === "error") {
            addToast(next.error ?? "분석 실패", "error");
          }
        }
      } catch (error: any) {
        setRunning(null);
        addToast(
          error?.response?.data?.message ?? "분석 상태 조회 실패",
          "error",
        );
      }
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [running, addToast]);

  const analyze = async () => {
    if (!file) return;
    try {
      const { jobId } = await adminApi.startCaptureOcr(file, model);
      runningMetaRef.current = {
        fileName: file.name || "붙여넣은 이미지",
        previewUrl: previewUrl ?? "",
      };
      setRunning({
        id: jobId,
        status: "running",
        model,
        startedAt: Date.now(),
        elapsedMs: 0,
      });
    } catch (error: any) {
      addToast(error?.response?.data?.message ?? "분석 시작 실패", "error");
    }
  };

  const isRunning = running?.status === "running";
  const ready = !!status?.reachable && !!model;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          캡처 인식 실험
        </h2>
        <p className="mt-0.5 text-xs text-text-tertiary">
          게임 종료 후 결과창(점수판) 캡처를 로컬 비전 모델로 읽어 봅니다.
          결과는 저장하지 않습니다.
        </p>
      </div>

      {/* 연결 상태 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <ScanText className="h-4 w-4 text-accent-primary" />
              모델 서버
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={loadStatus}
              disabled={statusLoading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${statusLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!status ? (
            <LoadingSpinner />
          ) : status.reachable ? (
            <>
              <p className="text-text-secondary">
                <span className="text-accent-success">● 연결됨</span> · Ollama{" "}
                {status.version} · 모델 {status.models.length}개
              </p>
              {status.models.length === 0 ? (
                <p className="text-xs text-text-tertiary">
                  설치된 모델이 없습니다. 호스트에서{" "}
                  <code>ollama pull {status.defaultModel}</code> 를 실행하세요.
                </p>
              ) : (
                <label className="flex items-center gap-2">
                  <span className="text-text-tertiary">모델</span>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={isRunning}
                    className="rounded-md border border-bg-tertiary bg-bg-secondary px-2 py-1 text-text-primary"
                  >
                    {status.models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name} ({(m.sizeMb / 1024).toFixed(1)}GB)
                        {m.name === status.defaultModel ? " · 기본" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          ) : (
            <p className="text-accent-danger">
              ● 연결 안 됨{" "}
              <span className="text-text-tertiary">— {status.error}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* 캡처 올리기 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageUp className="h-4 w-4 text-accent-primary" />
            결과창 캡처
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                fileInputRef.current?.click();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className="flex min-h-[140px] cursor-pointer items-center justify-center rounded-lg border border-dashed border-bg-tertiary p-3 text-center text-sm text-text-tertiary hover:border-accent-primary"
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob 미리보기
              <img
                src={previewUrl}
                alt="올린 결과창 캡처"
                className="max-h-[360px] w-auto rounded"
              />
            ) : (
              <span>
                클릭해서 고르거나, 끌어다 놓거나, <b>Ctrl+V</b> 로 붙여 넣으세요
              </span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center justify-end gap-3">
            {isRunning && (
              <span className="text-xs tabular-nums text-text-tertiary">
                {running.model} 분석 중… {Math.round(running.elapsedMs / 1000)}
                초
              </span>
            )}
            <Button
              size="sm"
              disabled={!file || !ready || isRunning}
              onClick={analyze}
            >
              {isRunning ? "분석 중…" : "분석"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 결과 (최신순) */}
      {runs.map((run) => (
        <RunResult key={run.job.id} run={run} />
      ))}
    </div>
  );
}

function RunResult({ run }: { run: RunRecord }) {
  const { job } = run;
  const result = job.result;
  const sec = (ms: number | null | undefined) =>
    typeof ms === "number" ? `${(ms / 1000).toFixed(1)}초` : "-";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
          <span>{job.model}</span>
          <span className="text-xs font-normal text-text-tertiary">
            {run.fileName}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {job.status === "error" || !result ? (
          <p className="text-accent-danger">{job.error ?? "분석 실패"}</p>
        ) : (
          <>
            {/* 속도 — 이미지 처리(prompt)와 글자 생성(eval)을 나눠 본다 */}
            <p className="text-xs tabular-nums text-text-secondary">
              전체 {sec(result.tookMs)} · 이미지 {result.imageWidth}×
              {result.imageHeight} · 입력 {result.promptTokens ?? "-"}토큰{" "}
              {sec(result.promptMs)} · 출력 {result.evalTokens ?? "-"}토큰{" "}
              {sec(result.evalMs)}
            </p>
            {result.parsed ? (
              <Scoreboard data={result.parsed} />
            ) : (
              <p className="text-accent-danger">
                JSON 으로 읽지 못했습니다. 아래 원문을 확인하세요.
              </p>
            )}
            {run.previewUrl && (
              <details>
                <summary className="cursor-pointer text-xs text-text-tertiary">
                  원본 캡처 (대조용)
                </summary>
                {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 blob 미리보기 */}
                <img
                  src={run.previewUrl}
                  alt="분석한 결과창 캡처"
                  className="mt-2 w-full rounded"
                />
              </details>
            )}
            <details>
              <summary className="cursor-pointer text-xs text-text-tertiary">
                원문 JSON
              </summary>
              <pre className="mt-2 max-h-80 overflow-auto rounded bg-bg-tertiary p-2 text-xs text-text-secondary">
                {result.raw}
              </pre>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Scoreboard({ data }: { data: CaptureOcrScoreboard }) {
  return (
    <div className="space-y-3">
      {data.durationText && (
        <p className="text-xs text-text-tertiary">
          게임 시간 {data.durationText}
        </p>
      )}
      {(data.teams ?? []).map((team, ti) => (
        <div key={ti} className="overflow-x-auto">
          <p
            className={`mb-1 text-xs font-semibold ${
              team.result === "WIN"
                ? "text-accent-success"
                : team.result === "LOSS"
                  ? "text-accent-danger"
                  : "text-text-tertiary"
            }`}
          >
            {ti === 0 ? "위쪽 팀" : "아래쪽 팀"} · {team.result ?? "UNKNOWN"}
          </p>
          <table className="w-full text-xs tabular-nums">
            <thead className="text-text-tertiary">
              <tr className="text-left">
                <th className="py-1 pr-2 font-normal">라이엇 ID</th>
                <th className="py-1 pr-2 font-normal">챔피언</th>
                <th className="py-1 pr-2 text-right font-normal">레벨</th>
                <th className="py-1 pr-2 text-right font-normal">K/D/A</th>
                <th className="py-1 pr-2 text-right font-normal">CS</th>
                <th className="py-1 text-right font-normal">골드</th>
              </tr>
            </thead>
            <tbody className="text-text-primary">
              {(team.players ?? []).map((p, pi) => (
                <tr key={pi} className="border-t border-bg-tertiary">
                  <td className="py-1 pr-2">{p.riotId || "-"}</td>
                  <td className="py-1 pr-2">{p.champion || "-"}</td>
                  <td className="py-1 pr-2 text-right">{p.level ?? "-"}</td>
                  <td className="py-1 pr-2 text-right">
                    {p.kills ?? "-"}/{p.deaths ?? "-"}/{p.assists ?? "-"}
                  </td>
                  <td className="py-1 pr-2 text-right">{p.cs ?? "-"}</td>
                  <td className="py-1 text-right">
                    {typeof p.gold === "number" ? p.gold.toLocaleString() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
