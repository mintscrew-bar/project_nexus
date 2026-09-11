"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ScrimProgressChart } from "./_components/ScrimProgressChart";
import { motion } from "framer-motion";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Crosshair,
  Download,
  Flag,
  ListOrdered,
  Play,
  Skull,
  Trophy,
  CheckCircle2,
} from "lucide-react";
import {
  PUBG_POINT_RULE_PRESETS,
  calculateScrimPoints,
  defaultPointRuleForMode,
  defaultPresetKeyForMode,
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
    damage?: number;
    teamId: string | null;
    teamName: string;
    placement: number;
    kills: number;
    deaths: number;
    points: number;
  }[];
};

type Scrim = {
  startsAt: string | null;
  cutoffAt: string | null;
  lastCollectedAt: string | null;
  collectionError: string | null;
  id: string;
  totalRounds: number;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  pointRule: PubgPointRule;
  rounds: ScrimRound[];
  leaderboard: ScrimLeaderboardRow[];
  /** 시작 전 팀장 준비 현황. 시작한 뒤에는 null. */
  ready: {
    captains: {
      teamId: string;
      teamName: string;
      userId: string;
      username: string;
      avatar: string | null;
      ready: boolean;
    }[];
    readyCount: number;
    requiredCount: number;
  } | null;
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
  const [ruleOpen, setRuleOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    if (!scrim?.cutoffAt || scrim.status === "COMPLETED") return;
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load, scrim?.cutoffAt, scrim?.status]);

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
    // 준비 상태와 시작은 모두에게 동시에 보여야 한다.
    socket.on("scrim-ready", refresh);
    socket.on("scrim-started", refresh);
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
        // 쿨다운은 "못 찾았다"가 아니라 "아직 안 봤다"라서 열지 않는다 —
        // 기다리면 자동으로 채워질 수 있는데 입력창부터 들이밀 이유가 없다.
        if (result.reason !== "COOLDOWN") setEditingRound(roundNumber);
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

  /**
   * 포인트 규칙 변경.
   *
   * 이미 입력된 결과의 포인트도 서버가 다시 계산해 덮는다 —
   * 규칙만 바꾸고 결과를 그대로 두면 화면 합계와 저장값이 어긋난다.
   */
  const handleRuleChange = async (rule: PubgPointRule) => {
    setBusy(true);
    try {
      await scrimApi.updatePointRule(roomId, rule);
      addToast(
        "포인트 규칙을 바꾸고 기존 결과를 다시 계산했습니다.",
        "success",
      );
      setRuleOpen(false);
      await load();
    } catch (err: any) {
      addToast(
        err?.response?.data?.message || "규칙을 바꾸지 못했습니다.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    if (
      scrim?.cutoffAt &&
      !window.confirm(
        "시간 안에 시작한 마지막 경기까지 결과가 반영됐나요? 확정하면 자동 수집이 종료됩니다.",
      )
    )
      return;
    setBusy(true);
    try {
      await scrimApi.completeScrim(roomId);
      addToast("스크림을 확정했습니다.", "success");
      await load();
    } catch (err: any) {
      addToast(err?.response?.data?.message || "확정하지 못했습니다.", "error");
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
        // 방 모드에 맞는 규칙으로 열어야 한다. 킬내기 방에서 배틀로얄 표를
        // 기본으로 띄우면 사망 감점이 빠진 채 시작된다.
        mode={room?.pubgGameMode ?? "BATTLE_ROYALE"}
        durationMinutes={room?.killMatchDurationMinutes ?? 60}
        configuredRounds={room?.battleRoyaleRounds ?? 3}
        onCreate={handleCreate}
        lobbyHref={`${gamePrefix}/tournaments/${roomId}/lobby`}
      />
    );
  }

  const completedRounds = scrim.rounds.filter(
    (round) => round.status === "COMPLETED",
  ).length;

  /**
   * 지금 어느 라운드인가.
   *
   * 진행 중이면 그 라운드를, 방금 끝났으면 다음 라운드를 가리킨다.
   * 킬내기는 시간제라 라운드를 미리 세어두지 않으므로 "다음 라운드"가 없다.
   */
  const lastRoundIndex = scrim.rounds.reduce(
    (last, round, index) => (round.status === "COMPLETED" ? index : last),
    -1,
  );

  /**
   * 라운드 형태는 배틀로얄만이다.
   *
   * 배틀로얄은 정해둔 판수를 차례로 치르므로 "한 판 끝 → 순위 확인 →
   * 다음 판 시작"이 흐름이 된다. 킬내기는 제한시간 안에 몇 판이든 치르는
   * 형식이라 다음 라운드라는 개념이 없다 — 판마다 기록이 쌓이고 총점만 본다.
   */
  const isTimed = !!scrim.cutoffAt;
  const runningRound = scrim.rounds.find(
    (round) => round.status === "IN_PROGRESS",
  );
  const nextPending = scrim.rounds.find((round) => round.status === "PENDING");
  const roundStatus = isTimed
    ? completedRounds > 0
      ? { message: `${completedRounds}판 기록됨 · 지금 총점입니다`, nextRound: null }
      : { message: "아직 기록된 판이 없습니다", nextRound: null }
    : runningRound
      ? { message: `${runningRound.roundNumber}라운드 진행 중`, nextRound: null }
      : lastRoundIndex >= 0
        ? {
            message: `${scrim.rounds[lastRoundIndex].roundNumber}라운드 종료 · 지금 순위입니다`,
            nextRound: nextPending?.roundNumber ?? null,
          }
        : nextPending
          ? {
              message: "아직 시작한 라운드가 없습니다",
              nextRound: nextPending.roundNumber,
            }
          : null;

  return (
    <div className="flex-grow px-5 py-8 sm:px-6 md:py-10 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <ScrimFlowStepper mode={room?.pubgGameMode ?? "BATTLE_ROYALE"} currentStep={getScrimFlowStep(scrim, room?.pubgGameMode ?? "BATTLE_ROYALE", completedRounds, runningRound)} />

        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-accent-primary">
              {room?.pubgGameMode === "KILL_MATCH"
                ? "킬내기"
                : "배틀로얄 스크림"}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-text-primary">
              {room?.name ?? "스크림"}
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              {scrim.cutoffAt
                ? `${completedRounds}경기 자동 집계`
                : `${completedRounds}/${scrim.totalRounds} 라운드 완료`}{" "}
              · {room?.pubgGameMode === "KILL_MATCH" ? "치킨" : "1위"}{" "}
              {scrim.pointRule.placementPoints[0] ?? 0}점 · 킬{" "}
              {scrim.pointRule.killPoints}점
              {(scrim.pointRule.deathPoints ?? 0) !== 0 &&
                ` · 사망 ${scrim.pointRule.deathPoints}점`}
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
              <>
                <Button
                  variant="ghost"
                  onClick={() => setRuleOpen((open) => !open)}
                >
                  포인트 규칙
                </Button>
                <Button
                  onClick={handleComplete}
                  disabled={
                    busy ||
                    !!(scrim.cutoffAt && now < Date.parse(scrim.cutoffAt))
                  }
                >
                  <Flag className="mr-1.5 h-4 w-4" />
                  스크림 확정
                </Button>
              </>
            )}
          </div>
        </header>

        {ruleOpen && isHost && (
          <Card>
            <CardHeader>
              <CardTitle>포인트 규칙 변경</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-text-tertiary">
                이미 입력된 라운드 결과의 점수도 함께 다시 계산됩니다.
              </p>
              {PUBG_POINT_RULE_PRESETS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  disabled={busy}
                  onClick={() => handleRuleChange(option.rule)}
                  className="w-full rounded-xl border border-bg-tertiary p-3 text-left transition-colors hover:border-accent-primary disabled:opacity-50"
                >
                  <div className="font-semibold text-text-primary">
                    {option.label}
                  </div>
                  <div className="mt-0.5 text-xs text-text-tertiary">
                    {option.description}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {/*
          라운드 사이에 멈춰 서는 자리.

          누적 표만 있으면 "지금 몇 라운드고 다음에 뭘 해야 하는지"가 표
          어딘가에 묻힌다. 대회 중계처럼 한 라운드가 끝나면 순위를 보여주고
          다음 라운드 시작을 눌러 넘어가는 흐름을 만든다.
        */}
        {/* 시작 전에는 준비가 화면의 전부다. 라운드·리더보드는 시작 뒤에. */}
        {scrim.ready ? (
          <KillMatchReady
            ready={scrim.ready}
            meId={user?.id}
            roomId={roomId}
            onChanged={load}
          />
        ) : null}

        {!scrim.ready && roundStatus && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-primary/25 bg-accent-primary/[0.07] px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">
              {roundStatus.message}
            </p>
            {roundStatus.nextRound && isHost && scrim.status !== "COMPLETED" && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => handleStartRound(roundStatus.nextRound!)}
              >
                {roundStatus.nextRound}라운드 시작
              </Button>
            )}
          </div>
        )}

        {!scrim.ready && (
          <FinalResultSummary scrim={scrim} />
        )}
        {!scrim.ready && (
          <Leaderboard scrim={scrim} lastRoundIndex={lastRoundIndex} teams={teams} />
        )}
        {/* 표가 정본이고 그림은 흐름을 읽는 용도라 표 뒤에 둔다. */}
        {!scrim.ready && (
          <ScrimProgressChart
            rounds={scrim.rounds}
            leaderboard={scrim.leaderboard}
          />
        )}
        {scrim.cutoffAt && (
          <Card>
            <CardContent className="space-y-2 pt-5">
              <p className="text-lg font-bold">
                {scrim.status === "COMPLETED"
                  ? "집계 확정"
                  : now < Date.parse(scrim.cutoffAt)
                    ? `남은 시간 ${Math.ceil((Date.parse(scrim.cutoffAt) - now) / 60_000)}분`
                    : "진행시간 종료 · 마지막 경기 결과 수집 중"}
              </p>
              <p className="text-sm text-text-secondary">
                종료 기준: {new Date(scrim.cutoffAt).toLocaleString("ko-KR")}{" "}
                이전에 시작한 경기. 이후 끝나도 포함합니다.
              </p>
              <p className="text-sm text-text-secondary">
                4명이 같은 스쿼드로 플레이한 경기를 자동 기록합니다. 마지막
                경기까지 반영된 뒤 방장이 확정해주세요.
              </p>
              <p className="text-sm text-text-secondary">
                {scrim.lastCollectedAt
                  ? `마지막 조회: ${new Date(scrim.lastCollectedAt).toLocaleTimeString("ko-KR")}`
                  : "첫 경기 기록을 기다리고 있습니다."}
              </p>
              {(!collectorEnabled || scrim.collectionError) && (
                <p className="text-accent-warning">
                  {scrim.collectionError ??
                    "자동 수집 연결을 사용할 수 없습니다. 운영자에게 문의해주세요."}
                </p>
              )}
            </CardContent>
          </Card>
        )}

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
                canCollect={collectorEnabled && !scrim.cutoffAt}
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
                teams={
                  scrim.cutoffAt
                    ? teams.filter((team) =>
                        round.results.some(
                          (result) => result.teamId === team.id,
                        ),
                      )
                    : teams
                }
                pointRule={scrim.pointRule}
              />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** 확정된 스크림의 결과를 경기 종료 화면처럼 먼저 보여준다. */
function FinalResultSummary({ scrim }: { scrim: Scrim }) {
  if (scrim.status !== "COMPLETED" || scrim.leaderboard.length === 0) {
    return null;
  }
  const podium = scrim.leaderboard.slice(0, 3);
  const modeLabel = scrim.cutoffAt ? "킬내기 최종 결과" : "배틀로얄 최종 결과";
  return (
    <Card className="overflow-hidden border-accent-primary/30 bg-gradient-to-br from-accent-primary/[0.12] via-bg-secondary to-bg-secondary">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-accent-warning" />
            {modeLabel}
          </CardTitle>
          <Badge variant="success">집계 확정</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          {podium.map((row, index) => (
            <motion.div
              key={row.teamId ?? row.teamName}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className={`rounded-xl border p-4 ${
                index === 0
                  ? "border-accent-warning/50 bg-accent-warning/10"
                  : "border-bg-tertiary bg-bg-primary/40"
              }`}
            >
              <p className="text-xs font-bold text-text-tertiary">{index + 1}위</p>
              <p className="mt-1 truncate text-lg font-black text-text-primary">
                {row.teamName}
              </p>
              <p className="mt-1 text-sm font-bold text-accent-primary">
                {row.totalPoints}점
              </p>
            </motion.div>
          ))}
        </div>
        <p className="mt-4 text-xs text-text-secondary">
          전체 {scrim.leaderboard.length}팀의 라운드별 기록과 순위 변동은 아래에서 확인할 수 있습니다.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * 시간제 킬내기 준비 화면.
 *
 * 만들자마자 시계가 돌면 아무도 안 모인 채로 제한시간이 흘러간다.
 * 팀장이 전원 준비를 누르면 그 순간 시작한다 — 마지막 사람이 누르는 즉시라
 * 방장이 따로 시작을 누르지 않는다.
 */
function KillMatchReady({
  ready,
  meId,
  roomId,
  onChanged,
}: {
  ready: NonNullable<Scrim["ready"]>;
  meId: string | undefined;
  roomId: string;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const { addToast } = useToast();
  const mine = ready.captains.find((captain) => captain.userId === meId);

  const toggle = async () => {
    setBusy(true);
    try {
      await scrimApi.toggleReady(roomId);
      await onChanged();
    } catch (error: any) {
      addToast(
        error?.response?.data?.message ?? "준비 상태를 바꾸지 못했습니다.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>팀장 준비</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-text-secondary">
          팀장 {ready.readyCount}/{ready.requiredCount}명 준비됐습니다.
          전원이 준비하면 그 순간 제한시간이 돌기 시작합니다.
        </p>

        <ul className="grid gap-2 sm:grid-cols-2">
          {ready.captains.map((captain) => (
            <li
              key={captain.teamId}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 ${
                captain.ready
                  ? "border-accent-success/40 bg-accent-success/[0.08]"
                  : "border-bg-tertiary bg-bg-primary/40"
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text-primary">
                  {captain.teamName}
                </span>
                <span className="block truncate text-xs text-text-tertiary">
                  {captain.username}
                </span>
              </span>
              <Badge variant={captain.ready ? "success" : "secondary"}>
                {captain.ready ? "준비" : "대기"}
              </Badge>
            </li>
          ))}
        </ul>

        {mine ? (
          <Button
            className="w-full"
            variant={mine.ready ? "secondary" : "primary"}
            disabled={busy}
            onClick={toggle}
          >
            {mine.ready ? "준비 취소" : "준비"}
          </Button>
        ) : (
          <p className="text-xs text-text-tertiary">
            팀장이 모두 준비하면 자동으로 시작합니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type ScrimFlowMode = "KILL_MATCH" | "BATTLE_ROYALE" | "FREE_MATCH";

function getScrimFlowStep(
  scrim: Scrim,
  mode: ScrimFlowMode,
  completedRounds: number,
  runningRound: ScrimRound | undefined,
) {
  if (scrim.status === "COMPLETED") return 4;
  if (mode === "KILL_MATCH") {
    if (scrim.ready) return 1;
    return completedRounds > 0 ? 3 : 2;
  }
  if (runningRound) return 2;
  return completedRounds > 0 ? 3 : 1;
}

function ScrimFlowStepper({
  mode,
  currentStep,
}: {
  mode: ScrimFlowMode;
  currentStep: number;
}) {
  const labels = mode === "KILL_MATCH"
    ? ["설정", "팀장 준비", "시간제 경기", "결과 검토", "최종 확정"]
    : ["설정", "라운드 시작", "경기 진행", "누적 순위", "최종 확정"];
  return (
    <div className="rounded-xl border border-bg-tertiary bg-bg-secondary px-4 py-3" aria-label="스크림 진행 단계">
      <div className="flex items-center justify-between gap-2 overflow-x-auto">
        {labels.map((label, index) => (
          <div key={label} className="flex min-w-max flex-1 items-center gap-2">
            <div className="flex items-center gap-2">
              <span className={index <= currentStep ? "flex h-7 w-7 items-center justify-center rounded-full bg-accent-primary text-xs font-bold text-accent-on" : "flex h-7 w-7 items-center justify-center rounded-full border border-bg-elevated text-xs font-bold text-text-tertiary"}>
                {index < currentStep ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
              </span>
              <span className={index === currentStep ? "text-sm font-bold text-text-primary" : index < currentStep ? "text-sm font-semibold text-accent-primary" : "text-sm text-text-tertiary"}>{label}</span>
            </div>
            {index < labels.length - 1 && <div className={index < currentStep ? "h-px flex-1 bg-accent-primary" : "h-px flex-1 bg-bg-elevated"} /> }
          </div>
        ))}
      </div>
    </div>
  );
}

/** 스크림 시작 전 — 라운드 수와 포인트표를 고른다. */
function ScrimSetup({
  configuredRounds,
  durationMinutes,
  isHost,
  busy,
  mode,
  onCreate,
  lobbyHref,
}: {
  configuredRounds: number;
  durationMinutes: number;
  isHost: boolean;
  busy: boolean;
  mode: "KILL_MATCH" | "BATTLE_ROYALE" | "FREE_MATCH";
  onCreate: (rule: PubgPointRule, totalRounds: number) => void;
  lobbyHref: string;
}) {
  const [preset, setPreset] = useState(() => defaultPresetKeyForMode(mode));
  const totalRounds = configuredRounds;
  const rule =
    PUBG_POINT_RULE_PRESETS.find((p) => p.key === preset)?.rule ??
    defaultPointRuleForMode(mode);

  if (!isHost) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 py-20">
        <EmptyState
          icon={Trophy}
          title="아직 스크림이 시작되지 않았습니다"
          description="방장이 시작하면 경기별 결과와 누적 팀 순위가 표시됩니다."
        />
      </div>
    );
  }

  return (
    <div className="flex-grow px-5 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <ScrimFlowStepper mode={mode} currentStep={0} />
        <header>
          <h1 className="text-2xl font-bold text-text-primary">스크림 설정</h1>
          <p className="mt-2 text-sm text-text-secondary">
            {mode === "KILL_MATCH"
              ? "시작 버튼을 누르면 제한시간이 흐르고, 참가 계정을 기준으로 경기 결과를 자동 수집합니다."
              : `모든 팀이 탈락 없이 ${totalRounds}판에 참가합니다. 매 판 킬·순위 점수를 합산하며 데스는 통계로 기록합니다.`}
          </p>
        </header>

        <Card>
          <CardContent className="space-y-5 pt-5">
            <label className="block text-sm text-text-secondary">
              {mode === "KILL_MATCH"
                ? `진행시간 ${durationMinutes}분 · 경기 수 제한 없음`
                : "라운드 수"}
              {mode !== "KILL_MATCH" && (
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={totalRounds}
                  readOnly
                  className="mt-2 w-full input"
                />
              )}
            </label>

            <div>
              <p className="text-sm text-text-secondary">포인트 규칙</p>
              <div className="mt-2 space-y-2">
                {PUBG_POINT_RULE_PRESETS.filter((option) =>
                  mode === "KILL_MATCH"
                    ? option.key.startsWith("kill-match")
                    : !option.key.startsWith("kill-match"),
                ).map((option) => (
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

/**
 * 직전 라운드가 끝나기 전의 순위.
 *
 * 라운드 하나로 순위가 어떻게 뒤집혔는지가 대회에서 가장 재미있는 지점인데,
 * 누적 표만 보면 그게 안 보인다. 방금 끝난 라운드 점수를 빼고 다시 세운다.
 *
 * 동점은 지금 순위 순서를 그대로 둔다 — 서버가 총점 다음에 쓰는 기준(총킬 등)을
 * 라운드별로는 알 수 없어서, 억지로 가르면 없던 변동이 생긴다.
 */
function previousRanks(
  scrim: Scrim,
  lastRoundIndex: number,
): Map<string, number> {
  if (lastRoundIndex < 0) return new Map();
  const rows = scrim.leaderboard.map((row, index) => ({
    key: row.teamId ?? row.teamName,
    before: row.totalPoints - (row.roundPoints[lastRoundIndex] ?? 0),
    order: index,
  }));
  rows.sort((a, b) => b.before - a.before || a.order - b.order);
  return new Map(rows.map((row, index) => [row.key, index + 1]));
}

/** 순위 변동 표시. 오른 팀은 초록 ▲, 내린 팀은 빨강 ▼. */
function RankDelta({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (delta === 0) {
    return <span className="ml-1 text-[10px] text-text-tertiary">–</span>;
  }
  const up = delta > 0;
  return (
    <span
      className={`ml-1 text-[10px] font-bold ${up ? "text-accent-success" : "text-accent-danger"}`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

function Leaderboard({
  scrim,
  lastRoundIndex,
  teams,
}: {
  scrim: Scrim;
  lastRoundIndex: number;
  teams: { id: string; name: string; members?: { id: string; user?: { username?: string; nickname?: string } }[] }[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const before = previousRanks(scrim, lastRoundIndex);
  const teamMembers = new Map(teams.map((team) => [team.id, team.members ?? []]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>누적 리더보드</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b border-bg-tertiary text-left text-xs text-text-tertiary">
              <th className="py-2 pr-3">#</th><th className="py-2 pr-3">팀</th>
              {scrim.rounds.map((round, i) => <th key={round.id} className={`py-2 pr-3 text-center ${i === lastRoundIndex ? "text-accent-primary" : ""}`}>{round.roundNumber}R</th>)}
              <th className="py-2 pr-3 text-right">킬</th><th className="py-2 pr-3 text-right">데스</th><th className="py-2 text-right">총점</th>
            </tr></thead>
            <tbody>{scrim.leaderboard.map((row, index) => {
              const key = row.teamId ?? row.teamName;
              const members = teamMembers.get(row.teamId ?? "") ?? [];
              const isOpen = expanded === key;
              return <Fragment key={key}><tr className="border-b border-bg-tertiary/50">
                <td className="py-2.5 pr-3 font-bold text-text-tertiary">{index + 1}<RankDelta delta={before.size === 0 ? null : (before.get(key) ?? index + 1) - (index + 1)} /></td>
                <td className="py-2.5 pr-3"><button type="button" onClick={() => setExpanded(isOpen ? null : key)} aria-expanded={isOpen} className="text-left font-semibold text-text-primary hover:text-accent-primary">{row.teamName}<span className="ml-2 text-xs text-text-tertiary">{isOpen ? "접기" : "팀원 보기"}</span></button>{row.wins > 0 && <Badge variant="primary" className="ml-2">치킨 {row.wins}회</Badge>}</td>
                {row.roundPoints.map((points, i) => <td key={i} className={`py-2.5 pr-3 text-center ${i === lastRoundIndex ? "font-bold text-accent-primary" : "text-text-secondary"}`}>{points === null ? "–" : points}</td>)}
                <td className="py-2.5 pr-3 text-right text-text-secondary">{row.totalKills}</td><td className="py-2.5 pr-3 text-right text-text-secondary">{row.totalDeaths}</td><td className="py-2.5 text-right font-black">{row.totalPoints}</td>
              </tr>{isOpen && <tr className="border-b border-bg-tertiary"><td colSpan={scrim.rounds.length + 5} className="bg-bg-primary p-3"><div className="grid gap-2 sm:grid-cols-2">{members.length > 0 ? members.map((member) => <div key={member.id} className="flex items-center justify-between rounded-md border border-bg-tertiary bg-bg-secondary px-4 py-3"><span className="truncate font-semibold">{member.user?.nickname ?? member.user?.username ?? "참가자"}</span><span className="text-xs text-text-tertiary">K/D/A · 딜량 수집 대기</span></div>) : <p className="px-2 py-3 text-xs text-text-tertiary">팀원 정보가 아직 없습니다.</p>}</div></td></tr>}</Fragment>;
            })}</tbody>
          </table>
        </div>
        <p className="text-xs text-text-tertiary">팀 행을 클릭하면 팀원 목록이 펼쳐집니다. 선수별 K/D/A·딜량 데이터가 연결되면 같은 카드에 표시됩니다.</p>
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
    <div
      className={
        round.status === "IN_PROGRESS"
          ? // 지금 치르는 판이 어느 것인지 목록에서도 바로 보여야 한다.
            "rounded-xl border border-accent-primary/40 bg-accent-primary/[0.06] p-4"
          : "rounded-xl border border-bg-tertiary bg-bg-primary/40 p-4"
      }
    >
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
                {result.deaths > 0 && (
                  <span className="text-text-tertiary">
                    <Skull className="mr-0.5 inline h-3 w-3" />
                    {result.deaths}
                  </span>
                )}
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
  existing: {
    damage?: number;
    teamId: string | null;
    placement: number;
    kills: number;
    deaths: number;
  }[];
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
        deaths: prev?.deaths ?? 0,
        damage: prev?.damage ?? 0,
      };
    }),
  );
  const [saving, setSaving] = useState(false);

  // 사망 감점이 있는 규칙(킬내기)에서만 사망 칸을 띄운다.
  const tracksDeaths = true;

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
          deaths: row.deaths,
          damage: row.damage,
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

      <div
        className={
          tracksDeaths
            ? "grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem_3.5rem] gap-2 px-1 text-[11px] text-text-tertiary"
            : "grid grid-cols-[1fr_5rem_5rem_3.5rem] gap-2 px-1 text-[11px] text-text-tertiary"
        }
      >
        <span>팀</span>
        <span className="text-center">순위</span>
        <span className="text-center">킬</span>
        {tracksDeaths && <span className="text-center">사망</span>}
        <span className="text-right">점수</span>
      </div>

      <div className="space-y-1.5">
        {rows.map((row, index) => (
          <div
            key={row.teamId}
            className={
              tracksDeaths
                ? "grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem_3.5rem] items-center gap-2"
                : "grid grid-cols-[1fr_5rem_5rem_3.5rem] items-center gap-2"
            }
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
                      ? {
                          ...r,
                          kills: Math.max(0, Number(e.target.value) || 0),
                        }
                      : r,
                  ),
                )
              }
              className="input text-center"
              aria-label={`${row.teamName} 킬`}
            />
            {/* 사망은 감점 규칙이 있을 때만 받는다 — 배틀로얄엔 없는 개념이다. */}
            {tracksDeaths && (
              <input
                type="number"
                min={0}
                max={100}
                value={row.deaths}
                onChange={(e) =>
                  setRows((current) =>
                    current.map((r, i) =>
                      i === index
                        ? {
                            ...r,
                            deaths: Math.max(0, Number(e.target.value) || 0),
                          }
                        : r,
                    ),
                  )
                }
                className="input text-center"
                aria-label={`${row.teamName} 사망`}
              />
            )}
            <span className="text-right text-sm font-bold text-accent-primary">
              {calculateScrimPoints(
                row.placement,
                row.kills,
                pointRule,
                row.deaths,
              )}
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <details className="mr-auto text-xs text-text-secondary">
          <summary className="cursor-pointer">동점 판정용 팀 데미지</summary>
          {rows.map((row, index) => (
            <label key={row.teamId} className="mt-2 flex items-center gap-2">
              {row.teamName}
              <input
                type="number"
                min={0}
                max={100000}
                step="any"
                className="input w-28"
                value={row.damage}
                onChange={(event) =>
                  setRows((current) =>
                    current.map((r, i) =>
                      i === index
                        ? {
                            ...r,
                            damage: Math.max(
                              0,
                              Number(event.target.value) || 0,
                            ),
                          }
                        : r,
                    ),
                  )
                }
              />
            </label>
          ))}
        </details>
        <Button size="sm" onClick={submit} disabled={saving}>
          {saving ? "저장 중..." : "결과 저장"}
        </Button>
      </div>
    </div>
  );
}
