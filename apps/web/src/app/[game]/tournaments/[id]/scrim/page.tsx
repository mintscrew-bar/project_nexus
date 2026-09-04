"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Crosshair,
  Download,
  Flag,
  ListOrdered,
  Play,
  Trophy,
} from "lucide-react";
import {
  DEFAULT_PUBG_POINT_RULE,
  PUBG_POINT_RULE_PRESETS,
  calculateScrimPoints,
  type PubgPointRule,
  type ScrimLeaderboardRow,
} from "@nexus/types";
import { scrimApi } from "@/lib/api-client";
import { connectScrimSocket, disconnectScrimSocket } from "@/lib/socket-client";
import { useAuthStore } from "@/stores/auth-store";
import { useLobbyStore } from "@/stores/lobby-store";
import { useGamePrefix } from "@/hooks/useCurrentGame";
import { useToast } from "@/components/ui/Toast";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadingSpinner,
} from "@/components/ui";

type ScrimRound = {
  id: string;
  roundNumber: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED";
  pubgMatchId: string | null;
  /** 결과를 어떻게 넣었는지. 자동으로 가져온 값과 손으로 넣은 값을 구분한다. */
  resultSource: string | null;
  results: {
    teamId: string | null;
    teamName: string;
    placement: number;
    kills: number;
    points: number;
  }[];
};

type Scrim = {
  id: string;
  totalRounds: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  pointRule: PubgPointRule;
  rounds: ScrimRound[];
  leaderboard: ScrimLeaderboardRow[];
};

export default function ScrimPage() {
  const params = useParams();
  const router = useRouter();
  const gamePrefix = useGamePrefix();
  const roomId = params.id as string;
  const { addToast } = useToast();
  const { user } = useAuthStore();
  const room = useLobbyStore((state) => state.room);

  const [scrim, setScrim] = useState<Scrim | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingRound, setEditingRound] = useState<number | null>(null);
  // 자동 수집은 커스텀 매치 판별이 실측되기 전까지 서버에서 꺼둔다.
  const [collectorEnabled, setCollectorEnabled] = useState(false);

  const isHost = !!user && !!room && room.hostId === user.id;
  const teams = useMemo(() => room?.teams ?? [], [room]);

  const load = useCallback(async () => {
    try {
      setScrim(await scrimApi.getScrim(roomId));
    } catch {
      addToast("스크림 정보를 불러오지 못했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }, [roomId, addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void scrimApi
      .getCollectorState(roomId)
      .then((state) => setCollectorEnabled(state.enabled))
      // 상태를 못 받으면 버튼을 띄우지 않는다. 수동 입력은 그대로 쓸 수 있다.
      .catch(() => setCollectorEnabled(false));
  }, [roomId]);

  // 라운드 시작·결과가 방장 화면에서만 보이면 나머지는 새로고침을 눌러야 한다.
  useEffect(() => {
    const socket = connectScrimSocket();
    if (!socket) return;
    socket.emit("join-scrim", { roomId });
    const refresh = () => void load();
    socket.on("scrim-created", refresh);
    socket.on("round-started", refresh);
    socket.on("round-completed", refresh);
    socket.on("scrim-updated", refresh);
    socket.on("scrim-completed", refresh);
    return () => {
      socket.emit("leave-scrim", { roomId });
      disconnectScrimSocket();
    };
  }, [roomId, load]);

  const handleCreate = async (rule: PubgPointRule, totalRounds: number) => {
    setBusy(true);
    try {
      await scrimApi.createScrim(roomId, { totalRounds, pointRule: rule });
      await load();
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "스크림을 시작하지 못했습니다.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleStartRound = async (roundNumber: number) => {
    setBusy(true);
    try {
      await scrimApi.startRound(roomId, roundNumber);
      await load();
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "라운드를 시작하지 못했습니다.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  /**
   * 라운드 결과 자동 수집.
   *
   * 못 찾으면 서버가 아무것도 쓰지 않고 이유를 돌려준다. 그 문장을 그대로
   * 보여주고 수동 입력으로 넘어가게 한다.
   */
  const handleCollect = async (roundNumber: number) => {
    setBusy(true);
    try {
      const result = await scrimApi.collectRound(roomId, roundNumber);
      if (result.matched) {
        addToast(
          `${roundNumber} 라운드 결과를 가져왔습니다. (${result.teamsFilled}팀)`,
          "success",
        );
        await load();
      } else {
        addToast(result.message, "warning");
        // 자동으로 못 찾았으면 바로 손으로 넣을 수 있게 입력창을 연다.
        setEditingRound(roundNumber);
      }
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "결과를 가져오지 못했습니다.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    setBusy(true);
    try {
      await scrimApi.completeScrim(roomId);
      addToast("스크림을 확정했습니다.", "success");
      await load();
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "확정하지 못했습니다.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  if (!scrim) {
    return (
      <ScrimSetup
        isHost={isHost}
        busy={busy}
        onCreate={handleCreate}
        lobbyHref={`${gamePrefix}/tournaments/${roomId}/lobby`}
      />
    );
  }

  const completedRounds = scrim.rounds.filter(
    (round) => round.status === "COMPLETED",
  ).length;

  return (
    <div className="flex-grow bg-bg-primary px-5 py-8 sm:px-6 md:py-10 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-accent-primary">
              배틀로얄 스크림
            </p>
            <h1 className="mt-1 text-2xl font-bold text-text-primary">
              {room?.name ?? "스크림"}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              {completedRounds}/{scrim.totalRounds} 라운드 완료 · 순위 1위{" "}
              {scrim.pointRule.placementPoints[0] ?? 0}점 · 킬{" "}
              {scrim.pointRule.killPoints}점
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`${gamePrefix}/tournaments/${roomId}/lobby`}
              className="rounded-lg bg-bg-tertiary px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
            >
              로비로
            </Link>
            {isHost && scrim.status !== "COMPLETED" && (
              <Button onClick={handleComplete} disabled={busy}>
                <Flag className="mr-1.5 h-4 w-4" />
                스크림 확정
              </Button>
            )}
          </div>
        </header>

        <Leaderboard scrim={scrim} />

        <Card>
          <CardHeader>
            <CardTitle>라운드</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {scrim.rounds.map((round) => (
              <RoundRow
                key={round.id}
                round={round}
                isHost={isHost && scrim.status !== "COMPLETED"}
                busy={busy}
                canCollect={collectorEnabled}
                onCollect={() => handleCollect(round.roundNumber)}
                editing={editingRound === round.roundNumber}
                onStart={() => handleStartRound(round.roundNumber)}
                onEdit={() =>
                  setEditingRound(
                    editingRound === round.roundNumber
                      ? null
                      : round.roundNumber,
                  )
                }
                onSubmitted={async () => {
                  setEditingRound(null);
                  await load();
                }}
                roomId={roomId}
                teams={teams}
                pointRule={scrim.pointRule}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** 스크림 시작 전 — 라운드 수와 포인트표를 고른다. */
function ScrimSetup({
  isHost,
  busy,
  onCreate,
  lobbyHref,
}: {
  isHost: boolean;
  busy: boolean;
  onCreate: (rule: PubgPointRule, totalRounds: number) => void;
  lobbyHref: string;
}) {
  const [preset, setPreset] = useState(PUBG_POINT_RULE_PRESETS[0].key);
  const [totalRounds, setTotalRounds] = useState(3);
  const rule =
    PUBG_POINT_RULE_PRESETS.find((p) => p.key === preset)?.rule ??
    DEFAULT_PUBG_POINT_RULE;

  if (!isHost) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-20">
        <EmptyState
          icon={Trophy}
          title="아직 스크림이 시작되지 않았습니다"
          description="방장이 라운드 수와 포인트 규칙을 정하면 여기에 리더보드가 나타납니다."
        />
      </div>
    );
  }

  return (
    <div className="flex-grow bg-bg-primary px-5 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-text-primary">스크림 설정</h1>
          <p className="mt-2 text-sm text-text-secondary">
            라운드를 반복하며 순위·킬 포인트를 누적합니다. 규칙은 시작한 뒤에도
            고칠 수 있고, 이미 입력한 결과의 점수도 함께 다시 계산됩니다.
          </p>
        </header>

        <Card>
          <CardContent className="space-y-5 pt-5">
            <label className="block text-sm text-text-secondary">
              라운드 수
              <input
                type="number"
                min={1}
                max={20}
                value={totalRounds}
                onChange={(e) =>
                  setTotalRounds(
                    Math.min(20, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                className="mt-2 w-full input"
              />
            </label>

            <div>
              <p className="text-sm text-text-secondary">포인트 규칙</p>
              <div className="mt-2 space-y-2">
                {PUBG_POINT_RULE_PRESETS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setPreset(option.key)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      preset === option.key
                        ? "border-accent-primary bg-accent-primary/10"
                        : "border-bg-tertiary hover:border-bg-elevated"
                    }`}
                  >
                    <div className="font-semibold text-text-primary">
                      {option.label}
                    </div>
                    <div className="mt-0.5 text-xs text-text-tertiary">
                      {option.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Link
                href={lobbyHref}
                className="inline-flex min-h-11 items-center rounded-lg bg-bg-tertiary px-4 text-sm font-semibold text-text-secondary"
              >
                로비로
              </Link>
              <Button
                onClick={() => onCreate(rule, totalRounds)}
                disabled={busy}
              >
                스크림 시작
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Leaderboard({ scrim }: { scrim: Scrim }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>누적 리더보드</CardTitle>
      </CardHeader>
      <CardContent>
        {/* 팀이 많으면 표가 화면을 넘는다. 표만 가로로 스크롤시킨다. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-bg-tertiary text-left text-xs text-text-tertiary">
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-3 font-semibold">팀</th>
                {scrim.rounds.map((round) => (
                  <th
                    key={round.id}
                    className="py-2 pr-3 text-center font-semibold"
                  >
                    {round.roundNumber}R
                  </th>
                ))}
                <th className="py-2 pr-3 text-right font-semibold">킬</th>
                <th className="py-2 text-right font-semibold">총점</th>
              </tr>
            </thead>
            <tbody>
              {scrim.leaderboard.map((row, index) => (
                <tr
                  key={row.teamId ?? row.teamName}
                  className="border-b border-bg-tertiary/50 last:border-0"
                >
                  <td className="py-2.5 pr-3 font-bold text-text-tertiary">
                    {index + 1}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className="font-semibold text-text-primary">
                      {row.teamName}
                    </span>
                    {row.wins > 0 && (
                      <Badge variant="primary" className="ml-2">
                        {row.wins}승
                      </Badge>
                    )}
                  </td>
                  {row.roundPoints.map((points, roundIndex) => (
                    <td
                      key={roundIndex}
                      className="py-2.5 pr-3 text-center text-text-secondary"
                    >
                      {/* 아직 안 한 판과 0점 받은 판은 다르다. */}
                      {points === null ? "–" : points}
                    </td>
                  ))}
                  <td className="py-2.5 pr-3 text-right text-text-secondary">
                    {row.totalKills}
                  </td>
                  <td className="py-2.5 text-right font-black text-text-primary">
                    {row.totalPoints}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function RoundRow({
  round,
  isHost,
  busy,
  editing,
  canCollect,
  onStart,
  onEdit,
  onCollect,
  onSubmitted,
  roomId,
  teams,
  pointRule,
}: {
  round: ScrimRound;
  isHost: boolean;
  busy: boolean;
  editing: boolean;
  /** 자동 수집이 열려 있는지. 닫혀 있으면 버튼 자체를 띄우지 않는다. */
  canCollect: boolean;
  onStart: () => void;
  onEdit: () => void;
  onCollect: () => void;
  onSubmitted: () => void;
  roomId: string;
  teams: { id: string; name: string }[];
  pointRule: PubgPointRule;
}) {
  const statusLabel =
    round.status === "COMPLETED"
      ? "완료"
      : round.status === "IN_PROGRESS"
        ? "진행 중"
        : "대기";

  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-primary/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-text-primary">
            {round.roundNumber} 라운드
          </span>
          <Badge
            variant={round.status === "COMPLETED" ? "primary" : "secondary"}
          >
            {statusLabel}
          </Badge>
          {round.pubgMatchId && (
            <span className="text-[11px] text-text-tertiary">
              매치 {round.pubgMatchId.slice(0, 12)}…
            </span>
          )}
          {round.resultSource && (
            <span className="text-[11px] text-text-tertiary">
              {round.resultSource === "AUTO" ? "자동 수집" : "직접 입력"}
            </span>
          )}
        </div>
        {isHost && (
          <div className="flex items-center gap-2">
            {round.status === "PENDING" && (
              <Button size="sm" onClick={onStart} disabled={busy}>
                <Play className="mr-1 h-3.5 w-3.5" />
                라운드 시작
              </Button>
            )}
            {canCollect && round.status === "IN_PROGRESS" && (
              <Button size="sm" onClick={onCollect} disabled={busy}>
                <Download className="mr-1 h-3.5 w-3.5" />
                결과 가져오기
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onEdit}>
              <ListOrdered className="mr-1 h-3.5 w-3.5" />
              {round.status === "COMPLETED" ? "결과 수정" : "결과 입력"}
            </Button>
          </div>
        )}
      </div>

      {round.results.length > 0 && !editing && (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {round.results.map((result) => (
            <div
              key={`${result.teamId ?? result.teamName}`}
              className="flex items-center justify-between rounded-lg bg-bg-tertiary/50 px-3 py-1.5 text-xs"
            >
              <span className="truncate text-text-primary">
                <span className="mr-2 font-bold text-text-tertiary">
                  {result.placement}위
                </span>
                {result.teamName}
              </span>
              <span className="flex items-center gap-2 text-text-secondary">
                <Crosshair className="h-3 w-3" />
                {result.kills}
                <span className="font-bold text-accent-primary">
                  {result.points}점
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <RoundResultForm
          roomId={roomId}
          roundNumber={round.roundNumber}
          teams={teams}
          pointRule={pointRule}
          existing={round.results}
          existingMatchId={round.pubgMatchId}
          onSubmitted={onSubmitted}
        />
      )}
    </div>
  );
}

/**
 * 라운드 결과 수동 입력.
 *
 * 자동 매칭이 붙기 전에는 유일한 경로다. 커스텀 매치 기록은 2주만 남으므로
 * 라운드가 끝나고 방치되면 결과를 영영 못 받는다.
 */
function RoundResultForm({
  roomId,
  roundNumber,
  teams,
  pointRule,
  existing,
  existingMatchId,
  onSubmitted,
}: {
  roomId: string;
  roundNumber: number;
  teams: { id: string; name: string }[];
  pointRule: PubgPointRule;
  existing: { teamId: string | null; placement: number; kills: number }[];
  existingMatchId: string | null;
  onSubmitted: () => void;
}) {
  const { addToast } = useToast();
  const [matchId, setMatchId] = useState(existingMatchId ?? "");
  const [rows, setRows] = useState(() =>
    teams.map((team, index) => {
      const prev = existing.find((r) => r.teamId === team.id);
      return {
        teamId: team.id,
        teamName: team.name,
        placement: prev?.placement ?? index + 1,
        kills: prev?.kills ?? 0,
      };
    }),
  );
  const [saving, setSaving] = useState(false);

  const duplicatePlacements = useMemo(() => {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const row of rows) {
      if (seen.has(row.placement)) dupes.add(row.placement);
      seen.add(row.placement);
    }
    return dupes;
  }, [rows]);

  const submit = async () => {
    if (duplicatePlacements.size > 0) {
      addToast("순위가 중복됩니다. 확인해주세요.", "error");
      return;
    }
    setSaving(true);
    try {
      await scrimApi.submitRoundResult(roomId, roundNumber, {
        pubgMatchId: matchId.trim() || undefined,
        results: rows.map((row) => ({
          teamId: row.teamId,
          placement: row.placement,
          kills: row.kills,
        })),
      });
      addToast(`${roundNumber} 라운드 결과를 저장했습니다.`, "success");
      onSubmitted();
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "결과 저장에 실패했습니다.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-bg-elevated bg-bg-secondary/50 p-3">
      <label className="block text-xs text-text-secondary">
        인게임 매치 ID (선택)
        <input
          value={matchId}
          onChange={(e) => setMatchId(e.target.value)}
          placeholder="알고 있으면 넣어두면 나중에 대조할 수 있습니다"
          className="mt-1.5 w-full input"
          maxLength={100}
        />
      </label>

      <div className="space-y-1.5">
        {rows.map((row, index) => (
          <div
            key={row.teamId}
            className="grid grid-cols-[1fr_5rem_5rem_3.5rem] items-center gap-2"
          >
            <span className="truncate text-sm text-text-primary">
              {row.teamName}
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={row.placement}
              onChange={(e) =>
                setRows((current) =>
                  current.map((r, i) =>
                    i === index
                      ? { ...r, placement: Number(e.target.value) || 1 }
                      : r,
                  ),
                )
              }
              className={`input text-center ${
                duplicatePlacements.has(row.placement)
                  ? "border-accent-danger"
                  : ""
              }`}
              aria-label={`${row.teamName} 순위`}
            />
            <input
              type="number"
              min={0}
              max={200}
              value={row.kills}
              onChange={(e) =>
                setRows((current) =>
                  current.map((r, i) =>
                    i === index
                      ? { ...r, kills: Math.max(0, Number(e.target.value) || 0) }
                      : r,
                  ),
                )
              }
              className="input text-center"
              aria-label={`${row.teamName} 킬`}
            />
            <span className="text-right text-sm font-bold text-accent-primary">
              {calculateScrimPoints(row.placement, row.kills, pointRule)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? "저장 중..." : "결과 저장"}
        </Button>
      </div>
    </div>
  );
}
