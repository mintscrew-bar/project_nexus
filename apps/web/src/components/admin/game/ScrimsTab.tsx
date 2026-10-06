"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api-client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  LoadingSpinner,
  Modal,
} from "@/components/ui";
import { Pagination, type AddToast } from "../shared";
import { useConfirm } from "../ConfirmDialog";

/**
 * 배그 스크림 기록.
 *
 * **롤 내전과 진행 방식이 다르다.** 롤은 대진표에서 팀 대 팀으로 붙어 승패가
 * 나지만, 배그는 여러 팀이 한 매치에 들어가 라운드를 반복하고 순위·킬 포인트를
 * 누적한다. 그래서 여기서 볼 것은 "누가 이겼나" 가 아니라 **라운드가 어디까지
 * 진행됐고 결과 수집이 붙었는가** 다.
 *
 * 데이터도 `Match` 가 아니라 `Scrim`/`ScrimRound` 에 쌓여서, 지금까지 관리자
 * 화면에서는 배그 내전이 아예 보이지 않았다.
 */
interface AdminScrim {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  totalRounds: number;
  completedRounds: number;
  startsAt: string | null;
  cutoffAt: string | null;
  lastCollectedAt: string | null;
  collectionError: string | null;
  createdAt: string;
  room: {
    id: string;
    name: string;
    status: string;
    pubgGameMode: "KILL_MATCH" | "BATTLE_ROYALE" | "FREE_MATCH" | null;
    maxParticipants: number;
    host: { id: string; username: string } | null;
  } | null;
  rounds: { id: string; roundNumber: number; status: string }[];
}

const STATUS_LABEL: Record<AdminScrim["status"], string> = {
  PENDING: "대기",
  IN_PROGRESS: "진행 중",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

const MODE_LABEL: Record<string, string> = {
  KILL_MATCH: "킬내기",
  BATTLE_ROYALE: "배틀로얄",
  FREE_MATCH: "자유 매치",
};

const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "PENDING", label: "대기" },
  { value: "IN_PROGRESS", label: "진행 중" },
  { value: "COMPLETED", label: "완료" },
  { value: "CANCELLED", label: "취소" },
];

interface ScrimDetail extends Omit<AdminScrim, "rounds"> {
  pendingMatches: number;
  pointRule: {
    placementPoints: number[];
    killPoints: number;
    deathPoints?: number;
  };
  rounds: {
    id: string;
    roundNumber: number;
    status: string;
    pubgMatchId: string | null;
    resultSource: string | null;
    results: {
      id: string;
      teamName: string;
      placement: number;
      kills: number;
      deaths: number;
      damage: number;
      points: number;
    }[];
  }[];
}

/**
 * 스크림 상세. 라운드별 팀 결과를 보고, ADMIN 은 잘못 붙은 라운드를 되돌린다.
 * 조치는 전부 되돌릴 수 없는 삭제를 동반해 확인을 한 번 더 받는다.
 */
function ScrimDetailModal({
  scrimId,
  isAdmin,
  onClose,
  onChanged,
  addToast,
}: {
  scrimId: string;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
  addToast: AddToast;
}) {
  const [detail, setDetail] = useState<ScrimDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      setDetail(await adminApi.getScrimDetail(scrimId));
    } catch {
      addToast("스크림 상세 로드 실패", "error");
      onClose();
    }
  }, [scrimId, addToast, onClose]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (
    confirmText: string,
    action: () => Promise<unknown>,
    done: string,
    options: { title: string; label: string; danger?: boolean } = {
      title: "확인",
      label: "진행",
    },
  ) => {
    const ok = await confirm({
      title: options.title,
      message: confirmText,
      confirmLabel: options.label,
      danger: options.danger ?? true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await action();
      addToast(done, "success");
      await load();
      onChanged();
    } catch (error: any) {
      addToast(error?.response?.data?.message ?? "처리 실패", "error");
    } finally {
      setBusy(false);
    }
  };

  const active = detail?.status === "IN_PROGRESS";

  return (
    <Modal isOpen onClose={onClose} title="스크림 상세" size="lg">
      {dialog}
      {!detail ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-4">
          <div>
            <p className="font-medium text-text-primary">
              {detail.room?.name ?? "(삭제된 방)"}
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              {STATUS_LABEL[detail.status]} · 라운드{" "}
              {detail.completedRounds ?? 0}/{detail.totalRounds} · 수집 대기
              매치 {detail.pendingMatches}건
            </p>
            {detail.collectionError && (
              <p className="mt-1 text-xs font-medium text-accent-danger">
                수집 오류: {detail.collectionError}
              </p>
            )}
            <p className="mt-1 text-xs text-text-tertiary">
              순위 점수 [{detail.pointRule?.placementPoints?.join(", ")}] · 킬{" "}
              {detail.pointRule?.killPoints}점
              {detail.pointRule?.deathPoints
                ? ` · 데스 ${detail.pointRule.deathPoints}점`
                : ""}
            </p>
          </div>

          {detail.rounds.length === 0 && (
            <p className="text-sm text-text-tertiary">
              시작된 라운드가 없습니다.
            </p>
          )}
          {detail.rounds.map((round) => (
            <div key={round.id} className="rounded-lg bg-bg-tertiary/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-text-primary">
                  {round.roundNumber}라운드{" "}
                  <span className="text-xs font-normal text-text-tertiary">
                    {round.status === "COMPLETED" ? "완료" : "진행 전/중"}
                    {round.resultSource
                      ? ` · ${round.resultSource === "AUTO" ? "자동 수집" : "수동 입력"}`
                      : ""}
                  </span>
                </p>
                {isAdmin &&
                  round.status !== "PENDING" &&
                  detail.status !== "CANCELLED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(
                          `${round.roundNumber}라운드 결과 ${round.results.length}팀을 지우고 처음 상태로 되돌립니다. 계속할까요?`,
                          () => adminApi.resetScrimRound(detail.id, round.id),
                          "라운드를 되돌렸습니다.",
                          { title: "라운드 결과 초기화", label: "초기화" },
                        )
                      }
                    >
                      결과 초기화
                    </Button>
                  )}
              </div>
              {round.pubgMatchId && (
                <p className="mt-1 break-all text-[11px] text-text-muted">
                  매치 {round.pubgMatchId}
                </p>
              )}
              {round.results.length > 0 && (
                <table className="mt-2 w-full text-xs">
                  <thead className="text-text-muted">
                    <tr>
                      <th className="py-1 text-left font-medium">순위</th>
                      <th className="text-left font-medium">팀</th>
                      <th className="text-right font-medium">킬</th>
                      <th className="text-right font-medium">데스</th>
                      <th className="text-right font-medium">딜량</th>
                      <th className="text-right font-medium">점수</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums text-text-secondary">
                    {round.results.map((r) => (
                      <tr key={r.id}>
                        <td className="py-0.5">{r.placement}</td>
                        <td className="text-text-primary">{r.teamName}</td>
                        <td className="text-right">{r.kills}</td>
                        <td className="text-right">{r.deaths}</td>
                        <td className="text-right">{Math.round(r.damage)}</td>
                        <td className="text-right font-semibold text-text-primary">
                          {r.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}

          {isAdmin && (active || detail.status === "PENDING") && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-bg-tertiary pt-3">
              {active && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    run(
                      "수집 오류를 지우고 다음 수집 주기에 다시 가져오게 합니다.",
                      () => adminApi.retryScrimCollection(detail.id),
                      "다음 수집 주기에 다시 확인합니다.",
                      { title: "수집 재시도", label: "재시도", danger: false },
                    )
                  }
                >
                  수집 재시도
                </Button>
              )}
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() =>
                  run(
                    "이 스크림을 취소 처리합니다. 방은 방 관리에서 따로 닫아야 합니다.",
                    () => adminApi.cancelScrim(detail.id),
                    "스크림을 취소했습니다.",
                    { title: "스크림 취소", label: "취소 처리" },
                  )
                }
              >
                스크림 취소
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export function ScrimsTab({
  addToast,
  isAdmin = false,
}: {
  addToast: AddToast;
  isAdmin?: boolean;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [scrims, setScrims] = useState<AdminScrim[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchScrims = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getScrims({
        page,
        limit,
        status: (status || undefined) as AdminScrim["status"] | undefined,
        search: search || undefined,
      });
      setScrims(data.scrims);
      setTotal(data.total);
    } catch {
      addToast("스크림 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, status, search, addToast]);

  useEffect(() => {
    fetchScrims();
  }, [fetchScrims]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            스크림 기록
          </h2>
          <p className="mt-0.5 text-xs text-text-tertiary">
            여러 팀이 라운드를 반복해 순위·킬 포인트를 누적합니다. 롤 내전과
            달리 대진표·승패가 없습니다.
          </p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setSearch(searchInput.trim());
          }}
        >
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="방 이름 검색"
            aria-label="방 이름으로 스크림 검색"
            className="w-44"
          />
        </form>
      </div>

      <div className="flex flex-wrap gap-1">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setPage(1);
              setStatus(opt.value);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              status === opt.value
                ? "bg-accent-primary text-accent-on"
                : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : scrims.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-text-tertiary">
            해당하는 스크림이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {scrims.map((scrim) => (
            <Card
              key={scrim.id}
              className="cursor-pointer transition-colors hover:border-accent-primary/40"
              onClick={() => setDetailId(scrim.id)}
            >
              <CardContent className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-text-primary">
                      {scrim.room?.name ?? "(삭제된 방)"}
                    </span>
                    {scrim.room?.pubgGameMode && (
                      <Badge variant="secondary">
                        {MODE_LABEL[scrim.room.pubgGameMode] ??
                          scrim.room.pubgGameMode}
                      </Badge>
                    )}
                    <Badge
                      variant={
                        scrim.status === "COMPLETED"
                          ? "success"
                          : scrim.status === "CANCELLED"
                            ? "danger"
                            : "secondary"
                      }
                    >
                      {STATUS_LABEL[scrim.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-text-tertiary">
                    방장 {scrim.room?.host?.username ?? "-"} ·{" "}
                    {scrim.room?.maxParticipants ?? "-"}명 정원 ·{" "}
                    {new Date(scrim.createdAt).toLocaleString("ko-KR")}
                  </p>
                  {/* 수집 실패는 운영자가 가장 먼저 알아야 하는 신호다.
                      전적이 안 붙으면 리더보드가 비어 방이 멈춘다. */}
                  {scrim.collectionError && (
                    <p className="mt-1 text-xs font-medium text-accent-danger">
                      수집 오류: {scrim.collectionError}
                    </p>
                  )}
                </div>

                <div className="flex flex-shrink-0 items-center gap-4">
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      라운드
                    </p>
                    <p className="font-figure text-sm font-bold tabular-nums text-text-primary">
                      {scrim.completedRounds} / {scrim.totalRounds}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                      마지막 수집
                    </p>
                    <p className="text-xs text-text-secondary">
                      {scrim.lastCollectedAt
                        ? new Date(scrim.lastCollectedAt).toLocaleString(
                            "ko-KR",
                          )
                        : "없음"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {detailId && (
        <ScrimDetailModal
          scrimId={detailId}
          isAdmin={isAdmin}
          onClose={() => setDetailId(null)}
          onChanged={fetchScrims}
          addToast={addToast}
        />
      )}
    </div>
  );
}
