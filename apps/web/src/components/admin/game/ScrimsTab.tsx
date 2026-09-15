"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/api-client";
import {
  Badge,
  Card,
  CardContent,
  Input,
  LoadingSpinner,
} from "@/components/ui";
import { Pagination, type AddToast } from "../shared";

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

export function ScrimsTab({ addToast }: { addToast: AddToast }) {
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
            스크림 기록 (배그)
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
            <Card key={scrim.id}>
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
    </div>
  );
}
