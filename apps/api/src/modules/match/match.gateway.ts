import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { MatchService } from "./match.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

// ── 가위바위보 진영 결정 ──
type RpsHand = "rock" | "paper" | "scissors";
interface RpsState {
  matchId: string;
  teamAId: string;
  teamBId: string;
  captainAId: string;
  captainBId: string;
  hostId: string;
  phase: "throw" | "side" | "done";
  submissions: Map<string, RpsHand>; // userId(팀장) -> 낸 손 (현재 라운드)
  winnerTeamId?: string;
  blueSideTeamId?: string;
}

@WebSocketGateway({
  namespace: "/match",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e4,
})
export class MatchGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // 가위바위보 진행 상태 (인메모리 — 단일 인스턴스 가정). 최종 진영만 DB 저장.
  private readonly rpsStates = new Map<string, RpsState>();
  private readonly rpsTimers = new Map<string, NodeJS.Timeout>();
  private readonly RPS_THROW_TIMEOUT = 30000; // 팀장 미제출 시 자동 랜덤
  private readonly RPS_SIDE_TIMEOUT = 30000; // 진영 미선택 시 자동 랜덤

  constructor(
    private readonly authService: AuthService,
    private readonly matchService: MatchService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = await this.authService.validateToken(token);

      if (!payload) {
        client.disconnect();
        return;
      }

      client.userId = payload.sub;
      client.username = payload.username;
    } catch (_error) {
      client.disconnect();
    }
  }

  handleDisconnect(_client: AuthenticatedSocket) {
    // no-op
  }

  @SubscribeMessage("join-match")
  async handleJoinMatch(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { matchId: string },
  ) {
    try {
      client.join(`match:${data.matchId}`);

      const match = await this.matchService.findById(data.matchId);

      // 진행 중인 가위바위보가 있으면 현재 상태를 이 클라이언트에 전달
      const rps = this.rpsStates.get(data.matchId);
      if (rps) {
        client.emit("rps:state", this.rpsStatePayload(rps));
      }

      return {
        success: true,
        match,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || "Failed to join match",
      };
    }
  }

  @SubscribeMessage("leave-match")
  handleLeaveMatch(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { matchId: string },
  ) {
    client.leave(`match:${data.matchId}`);
  }

  @SubscribeMessage("join-bracket")
  async handleJoinBracket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      client.join(`bracket:${data.roomId}`);

      const matches = await this.matchService.getRoomMatches(data.roomId);

      return {
        success: true,
        matches,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || "Failed to join bracket",
      };
    }
  }

  @SubscribeMessage("leave-bracket")
  handleLeaveBracket(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    client.leave(`bracket:${data.roomId}`);
  }

  // ========================================
  // 가위바위보 진영 결정
  // ========================================

  private rpsStatePayload(state: RpsState) {
    return {
      matchId: state.matchId,
      phase: state.phase,
      teamAId: state.teamAId,
      teamBId: state.teamBId,
      captainAId: state.captainAId,
      captainBId: state.captainBId,
      submitted: Array.from(state.submissions.keys()), // 누가 냈는지만 (손 내용은 공개 전 비공개)
      winnerTeamId: state.winnerTeamId ?? null,
      blueSideTeamId: state.blueSideTeamId ?? null,
    };
  }

  private broadcastRpsState(state: RpsState) {
    this.server
      .to(`match:${state.matchId}`)
      .emit("rps:state", this.rpsStatePayload(state));
  }

  private clearRpsTimer(matchId: string) {
    const t = this.rpsTimers.get(matchId);
    if (t) {
      clearTimeout(t);
      this.rpsTimers.delete(matchId);
    }
  }

  private armRpsTimer(matchId: string, ms: number, fn: () => void) {
    this.clearRpsTimer(matchId);
    this.rpsTimers.set(matchId, setTimeout(fn, ms));
  }

  private rpsRandomHand(): RpsHand {
    return (["rock", "paper", "scissors"] as RpsHand[])[
      Math.floor(Math.random() * 3)
    ];
  }

  // a가 b를 이기면 1, 지면 -1, 비기면 0
  private rpsJudge(a: RpsHand, b: RpsHand): number {
    if (a === b) return 0;
    const beats: Record<RpsHand, RpsHand> = {
      rock: "scissors",
      scissors: "paper",
      paper: "rock",
    };
    return beats[a] === b ? 1 : -1;
  }

  // 팀장 미제출 시 자동 랜덤 제출 후 판정
  private armRpsThrowTimeout(matchId: string) {
    this.armRpsTimer(matchId, this.RPS_THROW_TIMEOUT, () => {
      const state = this.rpsStates.get(matchId);
      if (!state || state.phase !== "throw") return;
      if (!state.submissions.has(state.captainAId)) {
        state.submissions.set(state.captainAId, this.rpsRandomHand());
      }
      if (!state.submissions.has(state.captainBId)) {
        state.submissions.set(state.captainBId, this.rpsRandomHand());
      }
      this.resolveRpsRound(matchId);
    });
  }

  private resolveRpsRound(matchId: string) {
    const state = this.rpsStates.get(matchId);
    if (!state || state.phase !== "throw") return;
    this.clearRpsTimer(matchId);

    const handA = state.submissions.get(state.captainAId);
    const handB = state.submissions.get(state.captainBId);
    if (!handA || !handB) return;

    const r = this.rpsJudge(handA, handB);
    if (r === 0) {
      // 무승부 — 공개 후 재경기
      this.server.to(`match:${matchId}`).emit("rps:reveal", {
        matchId,
        handA,
        handB,
        tie: true,
        winnerTeamId: null,
      });
      state.submissions = new Map();
      this.broadcastRpsState(state);
      this.armRpsThrowTimeout(matchId);
      return;
    }

    state.winnerTeamId = r === 1 ? state.teamAId : state.teamBId;
    state.phase = "side";
    this.server.to(`match:${matchId}`).emit("rps:reveal", {
      matchId,
      handA,
      handB,
      tie: false,
      winnerTeamId: state.winnerTeamId,
    });
    this.broadcastRpsState(state);

    // 진영 미선택 시 자동 랜덤
    this.armRpsTimer(matchId, this.RPS_SIDE_TIMEOUT, () => {
      const s = this.rpsStates.get(matchId);
      if (!s || s.phase !== "side") return;
      void this.finalizeRpsSide(matchId, Math.random() < 0.5 ? "blue" : "red");
    });
  }

  private async finalizeRpsSide(matchId: string, side: "blue" | "red") {
    const state = this.rpsStates.get(matchId);
    if (!state || state.phase === "done" || !state.winnerTeamId) return;
    this.clearRpsTimer(matchId);

    const winner = state.winnerTeamId;
    const loser = winner === state.teamAId ? state.teamBId : state.teamAId;
    const blueSideTeamId = side === "blue" ? winner : loser;
    state.blueSideTeamId = blueSideTeamId;
    state.phase = "done";

    try {
      await this.matchService.setBlueSide(matchId, blueSideTeamId);
    } catch {
      // best-effort
    }

    this.server.to(`match:${matchId}`).emit("rps:done", {
      matchId,
      blueSideTeamId,
      redSideTeamId:
        blueSideTeamId === state.teamAId ? state.teamBId : state.teamAId,
    });
    this.broadcastRpsState(state);

    // 진영 확정 → 매치 시작(IN_PROGRESS + 토너먼트 코드). 서버가 호스트 권한으로 실행.
    try {
      const result = await this.matchService.startMatch(state.hostId, matchId);
      await this.emitMatchStarted(matchId, {
        tournamentCode: result?.tournamentCode ?? undefined,
      });
    } catch {
      // 이미 시작됐거나 실패 — best-effort
    }

    // 상태 정리(지연)
    setTimeout(() => this.rpsStates.delete(matchId), 60000);
  }

  // 호스트가 매치 시작 → 가위바위보 단계 개시
  @SubscribeMessage("rps:start")
  async handleRpsStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { matchId: string },
  ) {
    try {
      const ctx = await this.matchService.getRpsContext(data.matchId);
      if (!client.userId || client.userId !== ctx.hostId) {
        return { success: false, error: "호스트만 시작할 수 있습니다." };
      }
      if (ctx.status !== "PENDING") {
        return { success: false, error: "이미 시작된 매치입니다." };
      }
      if (!ctx.teamAId || !ctx.teamBId || !ctx.captainAId || !ctx.captainBId) {
        return { success: false, error: "양 팀과 팀장이 확정돼야 합니다." };
      }

      const state: RpsState = {
        matchId: data.matchId,
        teamAId: ctx.teamAId,
        teamBId: ctx.teamBId,
        captainAId: ctx.captainAId,
        captainBId: ctx.captainBId,
        hostId: ctx.hostId,
        phase: "throw",
        submissions: new Map(),
      };
      this.rpsStates.set(data.matchId, state);
      this.broadcastRpsState(state);

      // 다른 팀장 소집 — 대진표 방에 알림(모달 자동 오픈 유도)
      const match = await this.matchService
        .findById(data.matchId)
        .catch(() => null);
      if (match?.roomId) {
        this.server
          .to(`bracket:${match.roomId}`)
          .emit("rps:invite", { matchId: data.matchId });
      }

      this.armRpsThrowTimeout(data.matchId);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || "가위바위보 시작 실패" };
    }
  }

  // 팀장이 손을 냄
  @SubscribeMessage("rps:submit")
  handleRpsSubmit(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { matchId: string; hand: RpsHand },
  ) {
    const state = this.rpsStates.get(data.matchId);
    if (!state || state.phase !== "throw") {
      return { success: false, error: "제출 단계가 아닙니다." };
    }
    if (
      !client.userId ||
      (client.userId !== state.captainAId && client.userId !== state.captainBId)
    ) {
      return { success: false, error: "팀장만 낼 수 있습니다." };
    }
    if (!["rock", "paper", "scissors"].includes(data.hand)) {
      return { success: false, error: "잘못된 입력입니다." };
    }

    state.submissions.set(client.userId, data.hand);
    this.broadcastRpsState(state);

    if (
      state.submissions.has(state.captainAId) &&
      state.submissions.has(state.captainBId)
    ) {
      this.resolveRpsRound(data.matchId);
    }
    return { success: true };
  }

  // 이긴 팀 팀장이 진영 선택
  @SubscribeMessage("rps:choose-side")
  async handleRpsChooseSide(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { matchId: string; side: "blue" | "red" },
  ) {
    const state = this.rpsStates.get(data.matchId);
    if (!state || state.phase !== "side" || !state.winnerTeamId) {
      return { success: false, error: "진영 선택 단계가 아닙니다." };
    }
    const winnerCaptain =
      state.winnerTeamId === state.teamAId
        ? state.captainAId
        : state.captainBId;
    if (!client.userId || client.userId !== winnerCaptain) {
      return { success: false, error: "이긴 팀 팀장만 선택할 수 있습니다." };
    }
    if (data.side !== "blue" && data.side !== "red") {
      return { success: false, error: "잘못된 진영입니다." };
    }
    await this.finalizeRpsSide(data.matchId, data.side);
    return { success: true };
  }

  // ========================================
  // Emit Events (called from service or controller)
  // ========================================

  async emitMatchStarted(matchId: string, data: { tournamentCode?: string }) {
    // 매치 개별 방에 알림
    this.server.to(`match:${matchId}`).emit("match-started", data);

    // 대진표 방에도 알림 — bracket 뷰 상태를 IN_PROGRESS로 갱신
    try {
      const match = await this.matchService.findById(matchId);
      if (match?.roomId) {
        this.server.to(`bracket:${match.roomId}`).emit("match-started", {
          matchId,
          tournamentCode: data.tournamentCode,
        });
      }
    } catch {
      // Best-effort: bracket view can fallback to REST polling
    }
  }

  async emitMatchResult(matchId: string, data: { winnerId: string }) {
    // Emit to individual match room
    this.server.to(`match:${matchId}`).emit("match-result", data);

    // Also emit to bracket room so bracket view gets real-time updates
    try {
      const match = await this.matchService.findById(matchId);
      if (match?.roomId) {
        this.server.to(`bracket:${match.roomId}`).emit("match-result", {
          matchId,
          winnerId: data.winnerId,
        });
      }
    } catch {
      // Best-effort: bracket view can fallback to REST polling
    }
  }

  emitBracketGenerated(roomId: string, data: { bracket: any }) {
    this.server.to(`bracket:${roomId}`).emit("bracket-generated", data);
  }

  emitBracketUpdate(roomId: string, data: { matches: any[] }) {
    this.server.to(`bracket:${roomId}`).emit("bracket-updated", data);
  }

  emitBracketComplete(roomId: string) {
    this.server.to(`bracket:${roomId}`).emit("bracket-complete");
  }

  emitTournamentCodeGenerated(matchId: string, data: { code: string }) {
    this.server.to(`match:${matchId}`).emit("tournament-code-generated", data);
  }

  emitSessionAborted(roomId: string, data: any) {
    this.server.to(`bracket:${roomId}`).emit("session-aborted", data);
  }

  async emitTournamentCompleted(roomId: string) {
    try {
      // Get final standings
      const matches = await this.matchService.getRoomMatches(roomId);

      // Calculate final standings (teams ranked by wins)
      const teamStats = new Map<
        string,
        { teamId: string; teamName: string; wins: number; losses: number }
      >();

      for (const match of matches) {
        // Type assertion: getRoomMatches includes teamA and teamB relations
        const matchWithTeams = match as typeof match & {
          teamA: { id: string; name: string } | null;
          teamB: { id: string; name: string } | null;
        };

        if (!matchWithTeams.teamA || !matchWithTeams.teamB) continue; // Skip TBD matches
        const teamAId = matchWithTeams.teamA.id;
        const teamBId = matchWithTeams.teamB.id;
        const teamAName = matchWithTeams.teamA.name;
        const teamBName = matchWithTeams.teamB.name;

        if (!teamStats.has(teamAId)) {
          teamStats.set(teamAId, {
            teamId: teamAId,
            teamName: teamAName,
            wins: 0,
            losses: 0,
          });
        }
        if (!teamStats.has(teamBId)) {
          teamStats.set(teamBId, {
            teamId: teamBId,
            teamName: teamBName,
            wins: 0,
            losses: 0,
          });
        }

        if (match.winnerId === teamAId) {
          teamStats.get(teamAId)!.wins++;
          teamStats.get(teamBId)!.losses++;
        } else if (match.winnerId === teamBId) {
          teamStats.get(teamBId)!.wins++;
          teamStats.get(teamAId)!.losses++;
        }
      }

      // Sort by wins (descending)
      const standings = Array.from(teamStats.values()).sort(
        (a, b) => b.wins - a.wins,
      );

      // Emit to all clients watching the bracket
      this.server.to(`bracket:${roomId}`).emit("tournament-completed", {
        standings,
        completedAt: new Date(),
      });
    } catch (error) {
      console.error(
        `[Match] Failed to emit tournament-completed for room ${roomId}:`,
        error,
      );
      this.server.to(`bracket:${roomId}`).emit("tournament-completed-error", {
        error: "Failed to calculate tournament standings",
        roomId,
      });
    }
  }
}
