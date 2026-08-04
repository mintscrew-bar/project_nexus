"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adminApi,
  type AdminInternalMatch,
  type AdminInternalMatchDetail,
} from "@/lib/api-client";
import { ChampionImage } from "@/components/ChampionImage";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  LoadingSpinner,
  Modal,
} from "@/components/ui";
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Database,
  Search,
  Swords,
  Trophy,
} from "lucide-react";

import type { AddToast } from "../shared";

const PAGE_SIZE = 20;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "대기",
  IN_PROGRESS: "진행중",
  COMPLETED: "완료",
  CANCELLED: "취소",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "danger"> = {
  PENDING: "secondary",
  IN_PROGRESS: "default",
  COMPLETED: "default",
  CANCELLED: "danger",
};

const TEAM_MODE_LABELS: Record<string, string> = {
  SNAKE_DRAFT: "스네이크",
  AUCTION: "경매",
  MANUAL_TEAM: "수동 편성",
  RANDOM: "랜덤",
};

const POSITION_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

/** 초 단위 게임 시간을 "32분 14초" 형태로 */
function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}분 ${String(s).padStart(2, "0")}초`;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 참가자를 라인 순서로 정렬 — Riot 표기와 동일한 순서로 읽히게 한다 */
function sortByPosition<T extends { position: string }>(list: T[]) {
  return [...list].sort((a, b) => {
    const ai = POSITION_ORDER.indexOf(a.position?.toUpperCase());
    const bi = POSITION_ORDER.indexOf(b.position?.toUpperCase());
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export function MatchesTab({ addToast }: { addToast: AddToast }) {
  const [matches, setMatches] = useState<AdminInternalMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [collected, setCollected] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getInternalMatches({
        page,
        limit: PAGE_SIZE,
        status: (status || undefined) as AdminInternalMatch["status"] | undefined,
        collected: (collected || undefined) as
          | "collected"
          | "pending"
          | undefined,
        search: search || undefined,
      });
      setMatches(data.matches);
      setTotal(data.total);
    } catch {
      addToast("내전 기록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, status, collected, search, addToast]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const submitSearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">내전 기록</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            실제로 진행된 내전 매치만 표시합니다. (외부 랭크 전적은 제외)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch();
              }}
              placeholder="방 이름 · 호스트"
              aria-label="내전 기록 검색"
              className="h-9 w-48 pl-9 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="매치 상태 필터"
            className="rounded-lg bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary focus:outline-none"
          >
            <option value="">전체 상태</option>
            <option value="COMPLETED">완료</option>
            <option value="IN_PROGRESS">진행중</option>
            <option value="PENDING">대기</option>
            <option value="CANCELLED">취소</option>
          </select>
          <select
            value={collected}
            onChange={(e) => {
              setCollected(e.target.value);
              setPage(1);
            }}
            aria-label="전적 수집 여부 필터"
            className="rounded-lg bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary focus:outline-none"
          >
            <option value="">수집 전체</option>
            <option value="collected">수집 완료</option>
            <option value="pending">미수집</option>
          </select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : matches.length === 0 ? (
            <p className="py-12 text-center text-text-muted">
              조건에 맞는 내전 기록이 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="px-4 py-3 text-left font-medium">방 / 호스트</th>
                    <th className="px-4 py-3 text-left font-medium">대진</th>
                    <th className="px-4 py-3 text-left font-medium">승자</th>
                    <th className="px-4 py-3 text-left font-medium">인원</th>
                    <th className="px-4 py-3 text-left font-medium">시간</th>
                    <th className="px-4 py-3 text-left font-medium">상태</th>
                    <th className="px-4 py-3 text-left font-medium">전적</th>
                    <th className="px-4 py-3 text-left font-medium">진행 시각</th>
                    <th className="px-4 py-3 text-left font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((match) => (
                    <tr
                      key={match.id}
                      className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-text-primary">
                          {match.room?.name ?? "삭제된 방"}
                        </div>
                        <div className="text-xs text-text-muted">
                          {match.room?.host?.username ?? "-"}
                          {match.room?.teamMode && (
                            <>
                              {" · "}
                              {TEAM_MODE_LABELS[match.room.teamMode] ??
                                match.room.teamMode}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {match.teamA?.name ?? "?"} vs {match.teamB?.name ?? "?"}
                        {match.bracketRound && (
                          <div className="text-xs text-text-muted">
                            {match.bracketRound}
                            {match.matchNumber ? ` #${match.matchNumber}` : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {match.winner ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-accent-success">
                            <Trophy className="h-3.5 w-3.5" />
                            {match.winner.name}
                          </span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {match._count.participants}명
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {formatDuration(match.gameDuration)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={STATUS_VARIANTS[match.status] ?? "default"}
                          className="text-[10px]"
                        >
                          {STATUS_LABELS[match.status] ?? match.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {match.dataCollected ? (
                          <span className="inline-flex items-center gap-1 text-xs text-accent-success">
                            <Database className="h-3.5 w-3.5" />
                            수집됨
                          </span>
                        ) : (
                          <span
                            className="text-xs text-text-muted"
                            title={`수집 시도 ${match.collectAttempts}회`}
                          >
                            미수집
                            {match.collectAttempts > 0 &&
                              ` (${match.collectAttempts}회 시도)`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-text-muted">
                        {formatDateTime(match.completedAt ?? match.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDetailId(match.id)}
                        >
                          상세
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            aria-label="이전 페이지"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-text-secondary">
            {page} / {totalPages} (총 {total}건)
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            aria-label="다음 페이지"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {detailId && (
        <MatchDetailModal
          matchId={detailId}
          onClose={() => setDetailId(null)}
          addToast={addToast}
        />
      )}
    </div>
  );
}

function MatchDetailModal({
  matchId,
  onClose,
  addToast,
}: {
  matchId: string;
  onClose: () => void;
  addToast: AddToast;
}) {
  const [detail, setDetail] = useState<AdminInternalMatchDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminApi
      .getInternalMatchDetail(matchId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) {
          addToast("내전 상세 로드 실패", "error");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, addToast, onClose]);

  // 참가자를 Nexus 팀 기준으로 나눈다. 전적 미수집 매치는 참가자 자체가 비어 있을 수 있다.
  const teams = useMemo(() => {
    if (!detail) return [];
    const groups: {
      id: string | null;
      name: string;
      isWinner: boolean;
      isBlueSide: boolean;
      players: AdminInternalMatchDetail["participants"];
      stats: AdminInternalMatchDetail["teamStats"][number] | undefined;
    }[] = [];

    for (const team of [detail.teamA, detail.teamB]) {
      if (!team) continue;
      groups.push({
        id: team.id,
        name: team.name,
        isWinner: detail.winnerId === team.id,
        isBlueSide: detail.blueSideTeamId === team.id,
        players: sortByPosition(
          detail.participants.filter((p) => p.teamId === team.id),
        ),
        stats: detail.teamStats.find((s) => s.teamId === team.id),
      });
    }
    return groups;
  }, [detail]);

  // 어느 팀에도 매칭되지 않은 참가자(팀 삭제 등) — 누락 없이 보여준다.
  const orphanPlayers = useMemo(() => {
    if (!detail) return [];
    const teamIds = new Set(teams.map((t) => t.id));
    return sortByPosition(
      detail.participants.filter((p) => !p.teamId || !teamIds.has(p.teamId)),
    );
  }, [detail, teams]);

  return (
    <Modal isOpen onClose={onClose} title="내전 상세" size="lg">
      {loading || !detail ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="space-y-5">
          {/* 요약 */}
          <div className="rounded-xl border border-bg-tertiary bg-bg-tertiary/30 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-text-primary">
                {detail.room?.name ?? "삭제된 방"}
              </span>
              <Badge
                variant={STATUS_VARIANTS[detail.status] ?? "default"}
                className="text-[10px]"
              >
                {STATUS_LABELS[detail.status] ?? detail.status}
              </Badge>
              {detail.dataCollected && (
                <Badge variant="secondary" className="text-[10px]">
                  전적 수집됨
                </Badge>
              )}
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
              <SummaryItem label="호스트" value={detail.room?.host?.username ?? "-"} />
              <SummaryItem
                label="팀 구성"
                value={
                  detail.room?.teamMode
                    ? TEAM_MODE_LABELS[detail.room.teamMode] ?? detail.room.teamMode
                    : "-"
                }
              />
              <SummaryItem label="게임 시간" value={formatDuration(detail.gameDuration)} />
              <SummaryItem label="시작" value={formatDateTime(detail.startedAt)} />
              <SummaryItem label="종료" value={formatDateTime(detail.completedAt)} />
              <SummaryItem label="패치" value={detail.patchVersion ?? "-"} />
              <SummaryItem label="Riot 매치 ID" value={detail.riotMatchId ?? "-"} />
              <SummaryItem
                label="MVP"
                value={detail.mvpUser?.username ?? "-"}
              />
              <SummaryItem label="ACE" value={detail.aceUser?.username ?? "-"} />
            </dl>

            {!detail.dataCollected && (
              <p className="mt-3 text-xs text-text-muted">
                아직 Riot 전적이 수집되지 않았습니다. 수집 시도 {detail.collectAttempts}회
                {detail.lastCollectAttemptAt &&
                  ` · 마지막 시도 ${formatDateTime(detail.lastCollectAttemptAt)}`}
              </p>
            )}
          </div>

          {/* 팀별 스코어보드 */}
          {teams.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-muted">
              팀 정보가 없습니다.
            </p>
          ) : (
            teams.map((team) => (
              <TeamScoreboard key={team.id ?? team.name} team={team} />
            ))
          )}

          {orphanPlayers.length > 0 && (
            <TeamScoreboard
              team={{
                id: null,
                name: "팀 미상",
                isWinner: false,
                isBlueSide: false,
                players: orphanPlayers,
                stats: undefined,
              }}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="truncate font-medium text-text-secondary" title={value}>
        {value}
      </dd>
    </div>
  );
}

function TeamScoreboard({
  team,
}: {
  team: {
    id: string | null;
    name: string;
    isWinner: boolean;
    isBlueSide: boolean;
    players: AdminInternalMatchDetail["participants"];
    stats: AdminInternalMatchDetail["teamStats"][number] | undefined;
  };
}) {
  const totals = team.players.reduce(
    (acc, p) => ({
      kills: acc.kills + p.kills,
      deaths: acc.deaths + p.deaths,
      assists: acc.assists + p.assists,
      gold: acc.gold + p.goldEarned,
    }),
    { kills: 0, deaths: 0, assists: 0, gold: 0 },
  );

  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        team.isWinner
          ? "border-accent-success/30 bg-accent-success/[0.06]"
          : "border-bg-tertiary bg-bg-secondary/40"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bg-tertiary/70 px-4 py-2.5">
        <div className="flex items-center gap-2">
          {team.isWinner ? (
            <Crown className="h-4 w-4 text-accent-success" />
          ) : (
            <Swords className="h-4 w-4 text-text-tertiary" />
          )}
          <span className="font-semibold text-text-primary">{team.name}</span>
          {team.isBlueSide && (
            <Badge variant="secondary" className="text-[10px]">
              블루
            </Badge>
          )}
          {team.isWinner && (
            <Badge variant="default" className="text-[10px]">
              승리
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <span>
            {totals.kills} / {totals.deaths} / {totals.assists}
          </span>
          <span>{totals.gold.toLocaleString()} G</span>
          {team.stats && (
            <>
              <span>타워 {team.stats.towerKills}</span>
              <span>드래곤 {team.stats.dragonKills}</span>
              <span>바론 {team.stats.baronKills}</span>
            </>
          )}
        </div>
      </div>

      {team.players.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-text-muted">
          참가자 전적이 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-xs">
            <thead>
              <tr className="text-text-muted">
                <th className="px-4 py-2 text-left font-medium">플레이어</th>
                <th className="px-3 py-2 text-left font-medium">라인</th>
                <th className="px-3 py-2 text-right font-medium">KDA</th>
                <th className="px-3 py-2 text-right font-medium">CS</th>
                <th className="px-3 py-2 text-right font-medium">골드</th>
                <th className="px-3 py-2 text-right font-medium">딜량</th>
                <th className="px-3 py-2 text-right font-medium">시야</th>
              </tr>
            </thead>
            <tbody>
              {team.players.map((p) => (
                <tr key={p.id} className="border-t border-bg-tertiary/40">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <ChampionImage
                        championKey={p.championName}
                        size={24}
                        className="flex-shrink-0 rounded"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-text-primary">
                          {p.user?.username ?? "탈퇴한 유저"}
                        </div>
                        <div className="truncate text-[10px] text-text-muted">
                          {p.championName}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-muted">{p.position || "-"}</td>
                  <td className="px-3 py-2 text-right text-text-secondary">
                    {p.kills} / {p.deaths} / {p.assists}
                  </td>
                  <td className="px-3 py-2 text-right text-text-muted">
                    {p.totalMinionsKilled + p.neutralMinionsKilled}
                  </td>
                  <td className="px-3 py-2 text-right text-text-muted">
                    {p.goldEarned.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-text-muted">
                    {p.totalDamageDealtToChampions.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-text-muted">
                    {p.visionScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
