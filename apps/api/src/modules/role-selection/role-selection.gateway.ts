import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { OnModuleDestroy, Inject, forwardRef } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { RoleSelectionService } from "./role-selection.service";
import { MatchGateway } from "../match/match.gateway";
import { MatchService } from "../match/match.service";
import { Role } from "@nexus/database";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

@WebSocketGateway({
  namespace: "/role-selection",
  cors: {
    origin: process.env.APP_URL || "http://localhost:3000",
    credentials: true,
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 1e4,
})
export class RoleSelectionGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private roomTimers = new Map<string, NodeJS.Timeout>();
  // 정확한 타이머 만료 시점에 completeRoleSelection을 호출하는 setTimeout Map
  private roomResolveTimers = new Map<string, NodeJS.Timeout>();
  // Guard against duplicate completeRoleSelection calls (timer + all-roles-selected race)
  private completingRooms = new Set<string>();
  private connectedUsers = new Map<
    string,
    { userId: string; roomId: string }
  >();

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly roleSelectionService: RoleSelectionService,
    @Inject(forwardRef(() => MatchGateway))
    private readonly matchGateway: MatchGateway,
    @Inject(forwardRef(() => MatchService))
    private readonly matchService: MatchService,
  ) {}

  onModuleDestroy() {
    for (const timer of this.roomTimers.values()) {
      clearInterval(timer);
    }
    this.roomTimers.clear();
    // 정확한 완료 타이머도 함께 정리
    for (const timer of this.roomResolveTimers.values()) {
      clearTimeout(timer);
    }
    this.roomResolveTimers.clear();
    this.completingRooms.clear();
    this.connectedUsers.clear();
  }

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

  handleDisconnect(client: AuthenticatedSocket) {
    this.connectedUsers.delete(client.id);
  }

  @SubscribeMessage("join-room")
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      // 방 참여자 검증
      if (client.userId) {
        const participant = await this.prisma.roomParticipant.findFirst({
          where: { userId: client.userId, roomId: data.roomId },
          select: { id: true },
        });
        if (!participant) {
          return { success: false, error: "방 참여자만 입장할 수 있습니다." };
        }
      }

      client.join(`room:${data.roomId}`);
      if (client.userId) {
        this.connectedUsers.set(client.id, {
          userId: client.userId,
          roomId: data.roomId,
        });
      }

      const roleSelectionData =
        await this.roleSelectionService.getRoleSelectionData(data.roomId);

      return {
        success: true,
        ...roleSelectionData,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || "Failed to join role selection room",
      };
    }
  }

  @SubscribeMessage("select-role")
  async handleSelectRole(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; role: Role },
  ) {
    try {
      if (!client.userId) {
        return { error: "Unauthorized" };
      }

      const result = await this.roleSelectionService.selectRole(
        client.userId,
        data.roomId,
        data.role,
      );

      // Broadcast role selection to all in room
      this.server.to(`room:${data.roomId}`).emit("role-selected", {
        userId: client.userId,
        username: client.username,
        teamId: result.teamId,
        role: data.role,
        memberId: result.member.id,
      });

      // If all roles are selected, complete role selection
      if (result.allRolesSelected) {
        await this.completeRoleSelection(data.roomId);
      }

      return { success: true, member: result.member };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  // ========================================
  // Timer Management
  // ========================================

  startTimer(roomId: string) {
    // 기존 타이머(interval + resolve timeout) 모두 정리
    this.stopTimer(roomId);

    // ── 5초 interval: UI 동기화용 tick 전송 ──────────────────────────────
    const interval = setInterval(() => {
      try {
        const timeRemaining =
          this.roleSelectionService.getTimeRemaining(roomId);

        // 5초 간격으로 서버 시간 보정 값 전송 (클라이언트는 로컬 카운트다운 사용)
        // timeRemaining > 0 일 때만 tick 전송 (0 이하면 resolve timer가 처리)
        if (timeRemaining > 0) {
          const state = this.roleSelectionService.getRoleSelectionState(roomId);
          this.server.to(`room:${roomId}`).emit("timer-tick", {
            timeRemaining,
            timerEndAt: state?.timerEnd ?? null,
          });
        }
      } catch (error) {
        console.error(
          `[RoleSelection] Timer tick error for room ${roomId}:`,
          error,
        );
        this.stopTimer(roomId);
      }
    }, 5000);

    this.roomTimers.set(roomId, interval);

    // ── 정확한 완료 시점 setTimeout: 게임 종료 지연 없이 즉시 트리거 ──────
    // 현재 남은 시간을 기반으로 정확한 만료 시각에 completeRoleSelection 호출
    const timeRemaining = this.roleSelectionService.getTimeRemaining(roomId);
    // 음수 방지: 이미 만료된 경우 즉시(0ms) 실행
    const delay = Math.max(0, timeRemaining);

    const resolveTimeout = setTimeout(() => {
      this.roomResolveTimers.delete(roomId);
      // interval tick도 더 이상 불필요하므로 정리
      const tickTimer = this.roomTimers.get(roomId);
      if (tickTimer) {
        clearInterval(tickTimer);
        this.roomTimers.delete(roomId);
      }

      this.completeRoleSelection(roomId).catch((error) => {
        console.error(
          `[RoleSelection] Resolve-timer completion failed for room ${roomId}:`,
          error,
        );
      });
    }, delay);

    this.roomResolveTimers.set(roomId, resolveTimeout);
  }

  stopTimer(roomId: string) {
    // 5초 interval 정리
    const timer = this.roomTimers.get(roomId);
    if (timer) {
      clearInterval(timer);
      this.roomTimers.delete(roomId);
    }
    // 정확한 완료 setTimeout 정리
    const resolveTimer = this.roomResolveTimers.get(roomId);
    if (resolveTimer) {
      clearTimeout(resolveTimer);
      this.roomResolveTimers.delete(roomId);
    }
  }

  clearRoomTimer(roomId: string) {
    this.stopTimer(roomId);
  }

  // ========================================
  // Completion
  // ========================================

  async completeRoleSelection(roomId: string) {
    // Prevent duplicate completion (timer expiry + all-roles-selected can race)
    if (this.completingRooms.has(roomId)) {
      return;
    }
    this.completingRooms.add(roomId);

    try {
      // Stop timer first to prevent further tick callbacks
      this.stopTimer(roomId);

      // Auto-assign any unselected roles before completing
      await this.roleSelectionService.autoAssignRemainingRoles(roomId);

      const room =
        await this.roleSelectionService.completeRoleSelection(roomId);

      this.server.to(`room:${roomId}`).emit("role-selection-navigation", {
        target: `/tournaments/${roomId}/bracket`,
      });

      // Notify all clients
      this.server.to(`room:${roomId}`).emit("role-selection-completed", {
        room,
      });

      // Emit bracket-generated so bracket page clients receive the data
      // 실패해도 bracket은 이미 DB에 생성되었으므로, bracket 페이지에서 재조회 가능
      try {
        const matches = await this.matchService.getRoomMatches(roomId);
        this.matchGateway.emitBracketGenerated(roomId, { bracket: matches });
      } catch (bracketError) {
        console.error(
          `[RoleSelection] Failed to emit bracket-generated for room ${roomId}:`,
          bracketError,
        );
        // bracket 페이지로 이동 후 클라이언트가 직접 조회하므로 치명적이지 않음
      }

      return room;
    } catch (error: any) {
      console.error("Error completing role selection:", error);

      // Send error message to clients
      const errorMessage = error?.message || "Role selection completion failed";
      this.server.to(`room:${roomId}`).emit("role-selection-error", {
        message: errorMessage,
        error: error?.response?.message || errorMessage,
      });

      // Also emit timeout event for backward compatibility
      this.server.to(`room:${roomId}`).emit("role-selection-timeout", {
        message: errorMessage,
      });

      throw error; // Re-throw to let caller handle it
    } finally {
      this.completingRooms.delete(roomId);
    }
  }

  // ========================================
  // External Methods (called by other gateways)
  // ========================================

  async emitRoleSelectionStarted(roomId: string, _data: any) {
    // Auto-assign roles by preference (mainRole → subRole → random) before notifying clients
    await this.roleSelectionService.autoAssignRolesByPreference(roomId);

    // Re-fetch data so clients receive the pre-assigned roles immediately
    const data = await this.roleSelectionService.getRoleSelectionData(roomId);
    this.server.to(`room:${roomId}`).emit("role-selection-started", data);

    // Start the countdown timer
    this.startTimer(roomId);
  }

  emitRoleSelectionError(roomId: string, data: { message: string; error?: string; retryable?: boolean }) {
    this.server.to(`room:${roomId}`).emit("role-selection-error", data);
  }

  emitSessionAborted(roomId: string, data: any) {
    this.stopTimer(roomId);
    this.completingRooms.delete(roomId);
    this.server.to(`room:${roomId}`).emit("session-aborted", data);
  }
}
