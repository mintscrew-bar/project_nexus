import { io, Socket } from "socket.io-client";
import { ensureValidToken } from "./api-client";

// 방 목록 delta update 타입
// type: 'add' — 새 방 추가, 'update' — 기존 방 갱신, 'remove' — 방 삭제
export type RoomListDelta =
  | { type: "add"; room: any }
  | { type: "update"; room: any }
  | { type: "remove"; roomId: string };

// is-typing 이벤트 debounce 유틸 — contextKey별 독립 관리
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const debounceEmit = (key: string, fn: () => void, delayMs = 500) => {
  const existing = debounceTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    fn();
    debounceTimers.delete(key);
  }, delayMs);
  debounceTimers.set(key, timer);
};

// ============================================================
// 소켓 인스턴스 — 두 그룹으로 구분
//
// [상시 소켓] 로그인 후 항상 연결 유지
//   - presence      : 온라인 상태 표시
//   - notification  : 실시간 알림
//   - dm            : 다이렉트 메시지
//   - clan          : 클랜 채팅
//   - room          : 방 목록·채팅 (방 입장 시 connect, 퇴장 시 disconnect)
//
// [게임 소켓] 특정 게임 단계에서만 연결 — 단계 종료 시 반드시 disconnect
//   - auction       : 경매 단계 (AUCTION 방 IN_PROGRESS)
//   - snakeDraft    : 스네이크 드래프트 단계 (SNAKE_DRAFT 방 DRAFT)
//   - match         : 매치·브래킷 단계 (IN_PROGRESS 이후)
//   - roleSelection : 역할 선택 단계 (ROLE_SELECTION)
// ============================================================

// Socket.io 클라이언트 인스턴스
let roomSocket: Socket | null = null;
let auctionSocket: Socket | null = null;
let snakeDraftSocket: Socket | null = null;
let matchSocket: Socket | null = null;
let clanSocket: Socket | null = null;
let presenceSocket: Socket | null = null;
let notificationSocket: Socket | null = null;
let dmSocket: Socket | null = null;
let roleSelectionSocket: Socket | null = null;

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const SOCKET_AUTH_MIN_TOKEN_TTL_MS = 2 * 60 * 1000;
const SOCKET_AUTH_MAX_ATTEMPTS = 12;
const SOCKET_AUTH_RETRY_DELAY_MS = 750;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ManagedSocket = Socket & {
  __nexusPreparing?: boolean;
  __nexusClosed?: boolean;
  __nexusLastConnectError?: {
    label: string;
    message: string;
    transport?: string;
    at: number;
  };
};

const isReusableSocket = (socket: Socket | null) => {
  const managed = socket as ManagedSocket | null;
  return (
    !!socket &&
    (socket.connected || socket.active || !!managed?.__nexusPreparing)
  );
};

const getSocketAuthPayload = async () => {
  for (let attempt = 1; attempt <= SOCKET_AUTH_MAX_ATTEMPTS; attempt += 1) {
    const token = await ensureValidToken(SOCKET_AUTH_MIN_TOKEN_TTL_MS).catch(
      () => null,
    );
    if (token) {
      return { token };
    }
    if (attempt < SOCKET_AUTH_MAX_ATTEMPTS) {
      await wait(SOCKET_AUTH_RETRY_DELAY_MS);
    }
  }
  return { token: null };
};

export const createAuthenticatedSocket = (namespace: string, label: string) => {
  const socket = io(`${SOCKET_URL}${namespace}`, {
    autoConnect: false,
    auth: async (cb) => cb(await getSocketAuthPayload()),
    transports: ["websocket", "polling"],
    upgrade: false,
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    timeout: 20000,
  }) as ManagedSocket;

  socket.__nexusPreparing = true;

  const disconnect = socket.disconnect.bind(socket);
  socket.disconnect = (() => {
    socket.__nexusClosed = true;
    socket.__nexusPreparing = false;
    return disconnect();
  }) as Socket["disconnect"];

  socket.on("connect_error", (error) => {
    socket.__nexusLastConnectError = {
      label,
      message: error.message,
      transport: socket.io.engine?.transport?.name,
      at: Date.now(),
    };
  });

  void getSocketAuthPayload().then((auth) => {
    socket.__nexusPreparing = false;
    if (socket.__nexusClosed || socket.connected || socket.active) return;
    if (!auth.token) return;
    socket.connect();
  });

  return socket;
};

// Room Socket 참조 (connect 없이 기존 인스턴스 조회)
export const getRoomSocket = () => roomSocket;

// Room Socket 연결
export const connectRoomSocket = () => {
  // Reuse existing instance if still connected, connecting, or reconnecting.
  if (isReusableSocket(roomSocket)) return roomSocket;
  // Clean up stale disconnected socket before creating a new one.
  if (roomSocket) {
    roomSocket.removeAllListeners();
    roomSocket = null;
  }

  roomSocket = createAuthenticatedSocket("/room", "Room");

  return roomSocket;
};

// ============================================================
// [게임 소켓] Auction — 경매 단계 전용
// 사용 시점: 방 상태가 IN_PROGRESS(경매 방식)인 동안
// 해제 시점: 경매 완료 또는 방 퇴장 시 useAuctionStore.disconnectFromAuction() 호출
// ============================================================
export const connectAuctionSocket = () => {
  // Reuse existing instance if still connected, connecting, or reconnecting.
  if (isReusableSocket(auctionSocket)) return auctionSocket;
  // Clean up stale disconnected socket before creating a new one.
  if (auctionSocket) {
    auctionSocket.removeAllListeners();
    auctionSocket = null;
  }

  auctionSocket = createAuthenticatedSocket("/auction", "Auction");

  auctionSocket.on("error", (error) => {
    console.error("Auction Socket Error:", error);
  });

  return auctionSocket;
};

// ============================================================
// [게임 소켓] Snake Draft — 스네이크 드래프트 단계 전용
// 사용 시점: 방 상태가 DRAFT(스네이크 드래프트 방식)인 동안
// 해제 시점: 드래프트 완료 또는 방 퇴장 시 useSnakeDraftStore.disconnectFromDraft() 호출
// ============================================================
export const connectSnakeDraftSocket = () => {
  if (isReusableSocket(snakeDraftSocket)) return snakeDraftSocket;
  if (snakeDraftSocket) {
    snakeDraftSocket.removeAllListeners();
    snakeDraftSocket = null;
  }

  snakeDraftSocket = createAuthenticatedSocket("/snake-draft", "Snake Draft");

  return snakeDraftSocket;
};

// ============================================================
// [게임 소켓] Match — 매치·브래킷 단계 전용
// 사용 시점: 팀 구성 완료 후 매치/토너먼트 브래킷이 진행되는 동안
// 해제 시점: 토너먼트 완료 또는 방 퇴장 시 disconnectMatchSocket() 호출
// ============================================================
export const connectMatchSocket = () => {
  if (isReusableSocket(matchSocket)) return matchSocket;
  if (matchSocket) {
    matchSocket.removeAllListeners();
    matchSocket = null;
  }

  matchSocket = createAuthenticatedSocket("/match", "Match");

  return matchSocket;
};

/**
 * 방송 오버레이(OBS)용 read-only /match 소켓.
 * 로그인 JWT가 아니라 방송 토큰으로 인증한다(백엔드가 토큰 검증 → read-only 연결).
 * 전역 싱글턴을 쓰지 않고 호출자가 직접 수명 관리(페이지 언마운트 시 disconnect).
 */
const connectBroadcastNamespace = (
  namespace: string,
  broadcastToken: string,
) => {
  return io(`${SOCKET_URL}${namespace}`, {
    autoConnect: true,
    auth: { token: broadcastToken },
    transports: ["websocket", "polling"],
    upgrade: false,
    withCredentials: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 20000,
  });
};

export const connectBroadcastSocket = (broadcastToken: string) =>
  connectBroadcastNamespace("/match", broadcastToken);

// 방송 오버레이 라이브 구독용(read-only) 소켓 — 단계별 네임스페이스
export const connectBroadcastAuctionSocket = (broadcastToken: string) =>
  connectBroadcastNamespace("/auction", broadcastToken);

export const connectBroadcastRoleSocket = (broadcastToken: string) =>
  connectBroadcastNamespace("/role-selection", broadcastToken);

export const connectBroadcastDraftSocket = (broadcastToken: string) =>
  connectBroadcastNamespace("/snake-draft", broadcastToken);

// Clan Socket 연결
export const connectClanSocket = () => {
  if (isReusableSocket(clanSocket)) return clanSocket;
  if (clanSocket) {
    clanSocket.removeAllListeners();
    clanSocket = null;
  }

  clanSocket = createAuthenticatedSocket("/clan", "Clan");

  return clanSocket;
};

// Room Socket 헬퍼 함수
export const roomSocketHelpers = {
  joinRoom: (roomId: string) => {
    roomSocket?.emit("join-room", { roomId });
  },

  leaveRoom: (roomId: string) => {
    roomSocket?.emit("leave-room", { roomId });
  },

  sendMessage: (roomId: string, message: string) => {
    roomSocket?.emit("send-message", { roomId, content: message });
  },

  sendIsTyping: (roomId: string, isTyping: boolean) => {
    // 매 키 입력마다 전송하지 않도록 500ms debounce 적용
    debounceEmit(`room-typing-${roomId}`, () => {
      roomSocket?.emit("is-typing", { roomId, isTyping });
    });
  },

  // Room list subscription
  subscribeRoomList: (callback: (response: any) => void) => {
    roomSocket?.emit("subscribe-room-list", {}, callback);
  },

  unsubscribeRoomList: () => {
    roomSocket?.emit("unsubscribe-room-list");
  },

  onRoomListUpdated: (callback: (delta: RoomListDelta) => void) => {
    roomSocket?.on("room-list-updated", callback);
  },

  offRoomListUpdated: () => {
    roomSocket?.off("room-list-updated");
  },

  onRoomUpdate: (callback: (data: any) => void) => {
    roomSocket?.on("room-updated", callback);
  },

  onParticipantJoined: (callback: (data: any) => void) => {
    roomSocket?.on("user-joined", callback);
  },

  onParticipantLeft: (callback: (data: any) => void) => {
    roomSocket?.on("user-left", callback);
  },

  onParticipantReady: (callback: (data: any) => void) => {
    roomSocket?.on("ready-status-changed", callback);
  },

  onNewMessage: (callback: (data: any) => void) => {
    roomSocket?.on("new-message", callback);
  },

  onUserTyping: (
    callback: (data: { userId: string; username: string }) => void,
  ) => {
    roomSocket?.on("user-typing", callback);
  },

  onUserStoppedTyping: (callback: (data: { userId: string }) => void) => {
    roomSocket?.on("user-stopped-typing", callback);
  },

  offAllListeners: () => {
    roomSocket?.off("room-updated");
    roomSocket?.off("user-joined");
    roomSocket?.off("user-left");
    roomSocket?.off("ready-status-changed");
    roomSocket?.off("new-message");
    roomSocket?.off("room-list-updated");
    roomSocket?.off("user-typing");
    roomSocket?.off("user-stopped-typing");
  },
};

// Auction Socket 헬퍼 함수
export const auctionSocketHelpers = {
  joinAuction: (roomId: string): Promise<any> => {
    return new Promise((resolve) => {
      if (!auctionSocket) {
        resolve({ success: false, error: "socket_not_initialized" });
        return;
      }

      let settled = false;
      const done = (value: any) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const emitJoin = () => {
        const ackTimeout = setTimeout(() => {
          done({ success: false, error: "join_timeout" });
        }, 15000);

        auctionSocket?.emit("join-room", { roomId }, (response: any) => {
          clearTimeout(ackTimeout);
          done(response ?? {});
        });
      };

      if (auctionSocket.connected) {
        emitJoin();
        return;
      }

      const connectTimeout = setTimeout(() => {
        auctionSocket?.off("connect", onConnect);
        done({ success: false, error: "connect_timeout" });
      }, 15000);

      const onConnect = () => {
        clearTimeout(connectTimeout);
        emitJoin();
      };

      auctionSocket.once("connect", onConnect);
    });
  },

  placeBid: (roomId: string, amount: number): Promise<any> => {
    return new Promise((resolve) => {
      if (!auctionSocket?.connected) {
        resolve({ error: "소켓이 연결되어 있지 않습니다." });
        return;
      }
      const timeout = setTimeout(() => {
        resolve({ error: "bid_timeout" });
      }, 5000);
      auctionSocket.emit("place-bid", { roomId, amount }, (response: any) => {
        clearTimeout(timeout);
        resolve(response ?? {});
      });
    });
  },

  onAuctionStarted: (callback: (data: any) => void) => {
    auctionSocket?.on("auction-started", callback);
  },

  onAuctionItemStarted: (callback: (data: any) => void) => {
    auctionSocket?.on("auction-item-started", callback);
  },

  onNewBid: (callback: (data: any) => void) => {
    auctionSocket?.on("bid-placed", callback); // ✅ Fixed: new-bid → bid-placed
  },

  onPlayerSold: (callback: (data: any) => void) => {
    auctionSocket?.on("player-sold", callback);
  },

  onPlayerUnsold: (callback: (data: any) => void) => {
    auctionSocket?.on("player-unsold", callback);
  },

  onAuctionComplete: (callback: (data: any) => void) => {
    auctionSocket?.on("auction-complete", callback);
  },

  onTimerUpdate: (callback: (data: any) => void) => {
    auctionSocket?.on("timer-update", callback);
  },

  onBidResolved: (callback: (data: any) => void) => {
    auctionSocket?.on("bid-resolved", callback); // ✅ Added: missing event
  },

  onTimerExpired: (callback: (data: any) => void) => {
    auctionSocket?.on("timer-expired", callback); // ✅ Added: missing event
  },

  // Captain selection events
  onCaptainSelectionPhase: (callback: (data: any) => void) => {
    auctionSocket?.on("captain-selection-phase", callback);
  },

  onVolunteerListUpdated: (callback: (data: any) => void) => {
    auctionSocket?.on("volunteer-list-updated", callback);
  },

  onVolunteerFinalized: (callback: (data: any) => void) => {
    auctionSocket?.on("volunteer-finalized", callback);
  },

  onCaptainsConfirmed: (callback: (data: any) => void) => {
    auctionSocket?.on("captains-confirmed", callback);
  },

  onSessionAborted: (callback: (data: any) => void) => {
    auctionSocket?.on("session-aborted", callback);
  },

  volunteerCaptain: (roomId: string): Promise<any> => {
    return new Promise((resolve) => {
      if (!auctionSocket?.connected) {
        resolve({ error: "소켓이 연결되어 있지 않습니다." });
        return;
      }
      const timeout = setTimeout(
        () => resolve({ error: "volunteer_timeout" }),
        10000,
      );
      auctionSocket.emit("volunteer-captain", { roomId }, (response: any) => {
        clearTimeout(timeout);
        resolve(response ?? {});
      });
    });
  },

  finalizeVolunteers: (
    roomId: string,
    selectedUserIds?: string[],
  ): Promise<any> => {
    return new Promise((resolve) => {
      if (!auctionSocket?.connected) {
        resolve({ error: "소켓이 연결되어 있지 않습니다." });
        return;
      }
      const timeout = setTimeout(
        () => resolve({ error: "finalize_timeout" }),
        10000,
      );
      auctionSocket.emit(
        "finalize-volunteers",
        { roomId, selectedUserIds },
        (response: any) => {
          clearTimeout(timeout);
          resolve(response ?? {});
        },
      );
    });
  },

  selectManualCaptains: (roomId: string, userIds: string[]): Promise<any> => {
    return new Promise((resolve) => {
      if (!auctionSocket?.connected) {
        resolve({ error: "소켓이 연결되어 있지 않습니다." });
        return;
      }
      const timeout = setTimeout(
        () => resolve({ error: "select_timeout" }),
        10000,
      );
      auctionSocket.emit(
        "select-manual-captains",
        { roomId, userIds },
        (response: any) => {
          clearTimeout(timeout);
          resolve(response ?? {});
        },
      );
    });
  },

  offAllListeners: () => {
    auctionSocket?.off("auction-started");
    auctionSocket?.off("auction-item-started");
    auctionSocket?.off("bid-placed");
    auctionSocket?.off("player-sold");
    auctionSocket?.off("player-unsold");
    auctionSocket?.off("auction-complete");
    auctionSocket?.off("timer-update");
    auctionSocket?.off("bid-resolved");
    auctionSocket?.off("timer-expired");
    auctionSocket?.off("captain-selection-phase");
    auctionSocket?.off("volunteer-list-updated");
    auctionSocket?.off("volunteer-finalized");
    auctionSocket?.off("captains-confirmed");
    auctionSocket?.off("session-aborted");
  },
};

// Snake Draft Socket 헬퍼 함수
export const snakeDraftSocketHelpers = {
  joinDraft: (roomId: string): Promise<any> => {
    return new Promise((resolve) => {
      if (!snakeDraftSocket) {
        resolve({ success: false, error: "socket_not_initialized" });
        return;
      }

      let settled = false;
      const done = (value: any) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const emitJoin = () => {
        const ackTimeout = setTimeout(() => {
          done({ success: false, error: "join_timeout" });
        }, 15000);

        snakeDraftSocket?.emit(
          "join-draft-room",
          { roomId },
          (response: any) => {
            clearTimeout(ackTimeout);
            done(response ?? {});
          },
        );
      };

      if (snakeDraftSocket.connected) {
        emitJoin();
        return;
      }

      const connectTimeout = setTimeout(() => {
        snakeDraftSocket?.off("connect", onConnect);
        done({ success: false, error: "connect_timeout" });
      }, 15000);

      const onConnect = () => {
        clearTimeout(connectTimeout);
        emitJoin();
      };

      snakeDraftSocket.once("connect", onConnect);
    });
  },

  makePick: (roomId: string, playerId: string): Promise<any> => {
    return new Promise((resolve) => {
      if (!snakeDraftSocket?.connected) {
        resolve({ error: "소켓이 연결되어 있지 않습니다." });
        return;
      }
      const timeout = setTimeout(() => {
        resolve({ error: "pick_timeout" });
      }, 10000);
      snakeDraftSocket.emit(
        "make-pick",
        { roomId, targetPlayerId: playerId },
        (response: any) => {
          clearTimeout(timeout);
          resolve(response ?? {});
        },
      );
    });
  },

  getDraftState: (roomId: string): Promise<any> => {
    return new Promise((resolve) => {
      if (!snakeDraftSocket?.connected) {
        resolve({ error: "소켓이 연결되어 있지 않습니다." });
        return;
      }
      const timeout = setTimeout(() => {
        resolve({ error: "state_timeout" });
      }, 10000);
      snakeDraftSocket.emit("get-draft-state", { roomId }, (response: any) => {
        clearTimeout(timeout);
        resolve(response ?? {});
      });
    });
  },

  onDraftStarted: (callback: (data: any) => void) => {
    snakeDraftSocket?.on("draft-started", callback);
  },

  onPickMade: (callback: (data: any) => void) => {
    snakeDraftSocket?.on("pick-made", callback);
  },

  onDraftComplete: (callback: (data: any) => void) => {
    snakeDraftSocket?.on("draft-complete", callback);
  },

  onTimerUpdate: (callback: (data: any) => void) => {
    snakeDraftSocket?.on("timer-update", callback);
  },

  onDraftState: (callback: (data: any) => void) => {
    snakeDraftSocket?.on("draft-state", callback);
  },

  onSessionAborted: (callback: (data: any) => void) => {
    snakeDraftSocket?.on("session-aborted", callback);
  },

  onNextPick: (callback: (data: any) => void) => {
    snakeDraftSocket?.on("next-pick", callback);
  },

  onAutoPickMade: (callback: (data: any) => void) => {
    snakeDraftSocket?.on("auto-pick-made", callback);
  },

  onTimerExpired: (callback: (data: any) => void) => {
    snakeDraftSocket?.on("timer-expired", callback);
  },

  offAllListeners: () => {
    snakeDraftSocket?.off("draft-started");
    snakeDraftSocket?.off("pick-made");
    snakeDraftSocket?.off("draft-complete");
    snakeDraftSocket?.off("timer-update");
    snakeDraftSocket?.off("draft-state");
    snakeDraftSocket?.off("session-aborted");
    snakeDraftSocket?.off("next-pick");
    snakeDraftSocket?.off("auto-pick-made");
    snakeDraftSocket?.off("timer-expired");
  },
};

// Match Socket 헬퍼 함수
// /match emit + ACK 타임아웃 헬퍼 (응답 없으면 timeout 실패로 resolve)
function emitMatchWithAck(
  event: string,
  payload: unknown,
  timeoutMs = 10000,
): Promise<any> {
  return new Promise((resolve) => {
    if (!matchSocket) return resolve({ success: false, error: "no_socket" });
    let settled = false;
    const done = (v: any) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const timer = setTimeout(
      () => done({ success: false, error: "timeout" }),
      timeoutMs,
    );
    matchSocket.emit(event, payload, (res: any) => {
      clearTimeout(timer);
      done(res ?? {});
    });
  });
}

export const matchSocketHelpers = {
  joinMatch: (matchId: string) => {
    matchSocket?.emit("join-match", { matchId });
  },

  joinBracket: (roomId: string): Promise<any> => {
    return new Promise((resolve) => {
      if (!matchSocket) {
        resolve({ success: false, error: "socket_not_initialized" });
        return;
      }

      let settled = false;
      const done = (value: any) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const emitJoin = () => {
        const ackTimeout = setTimeout(() => {
          done({ success: false, error: "join_timeout" });
        }, 15000);

        matchSocket?.emit("join-bracket", { roomId }, (response: any) => {
          clearTimeout(ackTimeout);
          done(response ?? {});
        });
      };

      if (matchSocket.connected) {
        emitJoin();
        return;
      }

      const connectTimeout = setTimeout(() => {
        matchSocket?.off("connect", onConnect);
        done({ success: false, error: "connect_timeout" });
      }, 15000);

      const onConnect = () => {
        clearTimeout(connectTimeout);
        emitJoin();
      };

      matchSocket.once("connect", onConnect);
    });
  },

  leaveMatch: (matchId: string) => {
    matchSocket?.emit("leave-match", { matchId });
  },

  leaveBracket: (roomId: string) => {
    matchSocket?.emit("leave-bracket", { roomId });
  },

  onBracketGenerated: (callback: (data: any) => void) => {
    matchSocket?.on("bracket-generated", callback);
  },

  onMatchStarted: (callback: (data: any) => void) => {
    matchSocket?.on("match-started", callback);
  },

  onMatchResult: (callback: (data: any) => void) => {
    matchSocket?.on("match-result", callback);
  },

  onBracketUpdated: (callback: (data: any) => void) => {
    matchSocket?.on("bracket-updated", callback);
  },

  onBracketComplete: (callback: () => void) => {
    matchSocket?.on("bracket-complete", callback);
  },

  onTournamentCompleted: (callback: (data: any) => void) => {
    matchSocket?.on("tournament-completed", callback);
  },

  onTournamentCodeGenerated: (callback: (data: any) => void) => {
    matchSocket?.on("tournament-code-generated", callback);
  },

  onSessionAborted: (callback: (data: any) => void) => {
    matchSocket?.on("session-aborted", callback);
  },

  // ── 가위바위보 진영 결정 ──
  // ACK 타임아웃: 응답이 없으면 일정 시간 후 실패로 resolve (Promise 영구 대기 방지)
  rpsStart: (matchId: string): Promise<any> =>
    emitMatchWithAck("rps:start", { matchId }),
  rpsCaptainReady: (matchId: string): Promise<any> =>
    emitMatchWithAck("rps:captain-ready", { matchId }),
  rpsSubmit: (
    matchId: string,
    hand: "rock" | "paper" | "scissors",
  ): Promise<any> => emitMatchWithAck("rps:submit", { matchId, hand }),
  rpsChooseSide: (matchId: string, side: "blue" | "red"): Promise<any> =>
    emitMatchWithAck("rps:choose-side", { matchId, side }),
  onRpsState: (callback: (data: any) => void) => {
    matchSocket?.on("rps:state", callback);
  },
  onRpsReveal: (callback: (data: any) => void) => {
    matchSocket?.on("rps:reveal", callback);
  },
  onRpsDone: (callback: (data: any) => void) => {
    matchSocket?.on("rps:done", callback);
  },
  onRpsInvite: (callback: (data: any) => void) => {
    matchSocket?.on("rps:invite", callback);
  },
  onRpsReadyState: (callback: (data: any) => void) => {
    matchSocket?.on("rps:ready-state", callback);
  },

  offAllListeners: () => {
    matchSocket?.off("bracket-generated");
    matchSocket?.off("match-started");
    matchSocket?.off("match-result");
    matchSocket?.off("bracket-updated");
    matchSocket?.off("bracket-complete");
    matchSocket?.off("tournament-completed");
    matchSocket?.off("tournament-code-generated");
    matchSocket?.off("session-aborted");
    matchSocket?.off("rps:state");
    matchSocket?.off("rps:reveal");
    matchSocket?.off("rps:done");
    matchSocket?.off("rps:invite");
    matchSocket?.off("rps:ready-state");
    matchSocket?.off("rps:error");
  },
};

// Presence Socket 연결
export const connectPresenceSocket = () => {
  if (isReusableSocket(presenceSocket)) return presenceSocket;
  if (presenceSocket) {
    presenceSocket.removeAllListeners();
    presenceSocket = null;
  }

  presenceSocket = createAuthenticatedSocket("/presence", "Presence");

  return presenceSocket;
};

// Presence Socket 헬퍼 함수
export const presenceSocketHelpers = {
  setStatus: (
    status: "ONLINE" | "AWAY",
    callback?: (response: any) => void,
  ) => {
    presenceSocket?.emit("set-status", { status }, callback);
  },

  getFriendsStatus: (callback: (response: any) => void) => {
    presenceSocket?.emit("get-friends-status", {}, callback);
  },

  subscribeFriend: (friendId: string, callback?: (response: any) => void) => {
    presenceSocket?.emit("subscribe-friend", { friendId }, callback);
  },

  unsubscribeFriend: (friendId: string) => {
    presenceSocket?.emit("unsubscribe-friend", { friendId });
  },

  onFriendStatusChanged: (
    callback: (data: {
      userId: string;
      status: string;
      lastSeenAt: string;
    }) => void,
  ) => {
    presenceSocket?.on("friend-status-changed", callback);
  },

  offAllListeners: () => {
    presenceSocket?.off("friend-status-changed");
  },
};

export const disconnectPresenceSocket = () => {
  presenceSocketHelpers.offAllListeners();
  presenceSocket?.disconnect();
  presenceSocket = null;
};

// Clan Socket 헬퍼 함수
export const clanSocketHelpers = {
  // 백엔드 이벤트명과 일치: "join-clan-chat", "leave-clan-chat", "send-clan-message"
  joinClan: (clanId: string) => {
    clanSocket?.emit("join-clan-chat", { clanId });
  },

  leaveClan: (clanId: string) => {
    clanSocket?.emit("leave-clan-chat", { clanId });
  },

  sendMessage: (clanId: string, message: string) => {
    // 백엔드: send-clan-message, content 필드 사용
    clanSocket?.emit("send-clan-message", { clanId, content: message });
  },

  sendIsTyping: (clanId: string, isTyping: boolean) => {
    // 매 키 입력마다 전송하지 않도록 500ms debounce 적용
    debounceEmit(`clan-typing-${clanId}`, () => {
      clanSocket?.emit("is-typing", { clanId, isTyping });
    });
  },

  onNewMessage: (callback: (data: any) => void) => {
    // 백엔드 emit: "new-clan-message"
    clanSocket?.on("new-clan-message", callback);
  },

  onMemberJoined: (callback: (data: any) => void) => {
    clanSocket?.on("member-joined", callback);
  },

  onMemberLeft: (callback: (data: any) => void) => {
    clanSocket?.on("member-left", callback);
  },

  onMemberKicked: (callback: (data: any) => void) => {
    clanSocket?.on("member-kicked", callback);
  },

  onMemberPromoted: (callback: (data: any) => void) => {
    clanSocket?.on("member-promoted", callback);
  },

  onClanUpdated: (callback: (data: any) => void) => {
    // 백엔드 emit: "clan-updated"
    clanSocket?.on("clan-updated", callback);
  },

  onClanDeleted: (callback: () => void) => {
    clanSocket?.on("clan-deleted", callback);
  },

  onOwnershipTransferred: (callback: (data: any) => void) => {
    clanSocket?.on("ownership-transferred", callback);
  },

  onUserTyping: (
    callback: (data: { userId: string; username: string }) => void,
  ) => {
    clanSocket?.on("user-typing", callback);
  },

  onUserStoppedTyping: (callback: (data: { userId: string }) => void) => {
    clanSocket?.on("user-stopped-typing", callback);
  },

  // 메시지 삭제 이벤트
  onMessageDeleted: (callback: (data: { messageId: string }) => void) => {
    clanSocket?.on("clan-message-deleted", callback);
  },

  // 공지사항 이벤트
  onAnnouncementCreated: (callback: (announcement: any) => void) => {
    clanSocket?.on("clan-announcement-created", callback);
  },

  onAnnouncementDeleted: (
    callback: (data: { announcementId: string }) => void,
  ) => {
    clanSocket?.on("clan-announcement-deleted", callback);
  },

  // 가입 요청 이벤트
  onJoinRequestReceived: (callback: (data: any) => void) => {
    clanSocket?.on("clan-join-request-received", callback);
  },

  offAllListeners: () => {
    clanSocket?.off("new-clan-message");
    clanSocket?.off("member-joined");
    clanSocket?.off("member-left");
    clanSocket?.off("member-kicked");
    clanSocket?.off("member-promoted");
    clanSocket?.off("clan-updated");
    clanSocket?.off("clan-deleted");
    clanSocket?.off("ownership-transferred");
    clanSocket?.off("user-typing");
    clanSocket?.off("user-stopped-typing");
    clanSocket?.off("clan-message-deleted");
    clanSocket?.off("clan-announcement-created");
    clanSocket?.off("clan-announcement-deleted");
    clanSocket?.off("clan-join-request-received");
  },
};

// Notification Socket 연결
export const connectNotificationSocket = () => {
  if (isReusableSocket(notificationSocket)) return notificationSocket;
  if (notificationSocket) {
    notificationSocket.removeAllListeners();
    notificationSocket = null;
  }

  notificationSocket = createAuthenticatedSocket(
    "/notification",
    "Notification",
  );

  return notificationSocket;
};

// Notification Socket 헬퍼 함수
export const notificationSocketHelpers = {
  onNotification: (callback: (notification: any) => void) => {
    notificationSocket?.on("notification", callback);
  },

  onUnreadCount: (callback: (data: { count: number }) => void) => {
    notificationSocket?.on("unread-count", callback);
  },

  offAllListeners: () => {
    notificationSocket?.off("notification");
    notificationSocket?.off("unread-count");
  },
};

export const disconnectNotificationSocket = () => {
  notificationSocketHelpers.offAllListeners();
  notificationSocket?.disconnect();
  notificationSocket = null;
};

// DM Socket 연결
export const connectDmSocket = () => {
  if (isReusableSocket(dmSocket)) return dmSocket;

  // 기존 소켓 정리
  if (dmSocket) {
    dmSocket.removeAllListeners();
    dmSocket.disconnect();
    dmSocket = null;
  }

  dmSocket = createAuthenticatedSocket("/dm", "DM");

  return dmSocket;
};

export const dmSocketHelpers = {
  sendMessage: (
    receiverId: string,
    content: string,
    callback?: (ack: any) => void,
  ) => {
    dmSocket?.emit("send-dm", { receiverId, content }, callback);
  },

  sendIsTyping: (receiverId: string, isTyping: boolean) => {
    // 매 키 입력마다 전송하지 않도록 500ms debounce 적용
    debounceEmit(`dm-typing-${receiverId}`, () => {
      dmSocket?.emit("is-typing", { receiverId, isTyping });
    });
  },

  markRead: (senderId: string) => {
    dmSocket?.emit("mark-read", { senderId });
  },

  onNewMessage: (callback: (message: any) => void) => {
    dmSocket?.on("new-dm", callback);
  },

  offNewMessage: (callback: (message: any) => void) => {
    dmSocket?.off("new-dm", callback);
  },

  onUserTyping: (
    callback: (data: { userId: string; username: string }) => void,
  ) => {
    dmSocket?.on("dm-typing", callback);
  },

  offUserTyping: (
    callback: (data: { userId: string; username: string }) => void,
  ) => {
    dmSocket?.off("dm-typing", callback);
  },

  onUserStoppedTyping: (callback: (data: { userId: string }) => void) => {
    dmSocket?.on("dm-stopped-typing", callback);
  },

  offUserStoppedTyping: (callback: (data: { userId: string }) => void) => {
    dmSocket?.off("dm-stopped-typing", callback);
  },

  onUnreadCount: (callback: (data: { total: number }) => void) => {
    dmSocket?.on("dm-unread-count", callback);
  },

  offUnreadCount: (callback: (data: { total: number }) => void) => {
    dmSocket?.off("dm-unread-count", callback);
  },

  offAllListeners: () => {
    dmSocket?.off("new-dm");
    dmSocket?.off("dm-typing");
    dmSocket?.off("dm-stopped-typing");
    dmSocket?.off("dm-unread-count");
  },
};

export const disconnectDmSocket = () => {
  // dm-typing-* 접두사 타이머 정리 — 연결 해제 후 불필요한 emit 방지
  debounceTimers.forEach((timer, key) => {
    if (key.startsWith("dm-typing-")) {
      clearTimeout(timer);
      debounceTimers.delete(key);
    }
  });
  dmSocketHelpers.offAllListeners();
  dmSocket?.disconnect();
  dmSocket = null;
};

// 모든 소켓 연결 해제
export const disconnectAllSockets = () => {
  // 남아있는 debounce 타이머 전부 정리 — 메모리 누수 방지
  debounceTimers.forEach((timer) => clearTimeout(timer));
  debounceTimers.clear();

  roomSocket?.removeAllListeners();
  auctionSocket?.removeAllListeners();
  snakeDraftSocket?.removeAllListeners();
  matchSocket?.removeAllListeners();
  clanSocket?.removeAllListeners();
  presenceSocket?.removeAllListeners();
  notificationSocket?.removeAllListeners();
  dmSocket?.removeAllListeners();
  roleSelectionSocket?.removeAllListeners();

  roomSocket?.disconnect();
  auctionSocket?.disconnect();
  snakeDraftSocket?.disconnect();
  matchSocket?.disconnect();
  clanSocket?.disconnect();
  presenceSocket?.disconnect();
  notificationSocket?.disconnect();
  dmSocket?.disconnect();
  roleSelectionSocket?.disconnect();

  roomSocket = null;
  auctionSocket = null;
  snakeDraftSocket = null;
  matchSocket = null;
  clanSocket = null;
  presenceSocket = null;
  notificationSocket = null;
  dmSocket = null;
  roleSelectionSocket = null;
};

// 특정 소켓 연결 해제
export const disconnectRoomSocket = () => {
  // room-typing-* 접두사 타이머 정리 — 연결 해제 후 불필요한 emit 방지
  debounceTimers.forEach((timer, key) => {
    if (key.startsWith("room-typing-")) {
      clearTimeout(timer);
      debounceTimers.delete(key);
    }
  });
  roomSocketHelpers.offAllListeners();
  roomSocket?.disconnect();
  roomSocket = null;
};

export const disconnectAuctionSocket = () => {
  auctionSocketHelpers.offAllListeners();
  auctionSocket?.off("connect");
  auctionSocket?.off("disconnect");
  auctionSocket?.disconnect();
  auctionSocket = null;
};

export const disconnectSnakeDraftSocket = () => {
  snakeDraftSocketHelpers.offAllListeners();
  snakeDraftSocket?.off("connect");
  snakeDraftSocket?.off("disconnect");
  snakeDraftSocket?.disconnect();
  snakeDraftSocket = null;
};

export const disconnectMatchSocket = () => {
  matchSocketHelpers.offAllListeners();
  matchSocket?.disconnect();
  matchSocket = null;
};

export const disconnectClanSocket = () => {
  // clan-typing-* 접두사 타이머 정리 — 연결 해제 후 불필요한 emit 방지
  debounceTimers.forEach((timer, key) => {
    if (key.startsWith("clan-typing-")) {
      clearTimeout(timer);
      debounceTimers.delete(key);
    }
  });
  clanSocketHelpers.offAllListeners();
  clanSocket?.disconnect();
  clanSocket = null;
};

// ========================================
// Role Selection Socket
// ========================================

// ============================================================
// [게임 소켓] Role Selection — 역할 선택 단계 전용
// 사용 시점: 방 상태가 ROLE_SELECTION인 동안
// 해제 시점: 역할 선택 완료 또는 세션 중단 시 useRoleSelectionStore.disconnect() 호출
// ============================================================
export const connectRoleSelectionSocket = () => {
  if (isReusableSocket(roleSelectionSocket)) return roleSelectionSocket;
  if (roleSelectionSocket) {
    roleSelectionSocket.removeAllListeners();
    roleSelectionSocket = null;
  }

  roleSelectionSocket = createAuthenticatedSocket(
    "/role-selection",
    "Role Selection",
  );

  return roleSelectionSocket;
};

export const roleSelectionSocketHelpers = {
  joinRoom: (roomId: string) => {
    return new Promise<any>((resolve) => {
      if (!roleSelectionSocket) {
        resolve({ success: false, error: "socket_not_initialized" });
        return;
      }

      let settled = false;
      const done = (value: any) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const emitJoin = () => {
        const ackTimeout = setTimeout(() => {
          done({ success: false, error: "join_timeout" });
        }, 15000);

        roleSelectionSocket?.emit("join-room", { roomId }, (response: any) => {
          clearTimeout(ackTimeout);
          done(response ?? {});
        });
      };

      if (roleSelectionSocket.connected) {
        emitJoin();
        return;
      }

      const connectTimeout = setTimeout(() => {
        roleSelectionSocket?.off("connect", onConnect);
        done({ success: false, error: "connect_timeout" });
      }, 15000);

      const onConnect = () => {
        clearTimeout(connectTimeout);
        emitJoin();
      };

      roleSelectionSocket.once("connect", onConnect);
    });
  },

  selectRole: (roomId: string, role: string): Promise<any> => {
    return new Promise<any>((resolve) => {
      if (!roleSelectionSocket?.connected) {
        resolve({ error: "소켓이 연결되어 있지 않습니다." });
        return;
      }
      const timeout = setTimeout(() => {
        resolve({ error: "role_selection_timeout" });
      }, 15000);
      roleSelectionSocket.emit(
        "select-role",
        { roomId, role },
        (response: any) => {
          clearTimeout(timeout);
          resolve(response ?? {});
        },
      );
    });
  },

  extendTimer: (roomId: string): Promise<any> => {
    return new Promise<any>((resolve) => {
      if (!roleSelectionSocket?.connected) {
        resolve({ error: "소켓이 연결되어 있지 않습니다." });
        return;
      }
      const timeout = setTimeout(() => resolve({ error: "timeout" }), 10000);
      roleSelectionSocket.emit("extend-timer", { roomId }, (response: any) => {
        clearTimeout(timeout);
        resolve(response ?? {});
      });
    });
  },

  onTimerExtended: (
    callback: (data: {
      timerEndAt: number;
      timeRemaining: number;
      extendedBy: string;
    }) => void,
  ) => {
    roleSelectionSocket?.on("timer-extended", callback);
  },

  cancelRole: (roomId: string): Promise<any> => {
    return new Promise<any>((resolve) => {
      if (!roleSelectionSocket?.connected) {
        resolve({ error: "소켓이 연결되어 있지 않습니다." });
        return;
      }
      const timeout = setTimeout(() => resolve({ error: "timeout" }), 10000);
      roleSelectionSocket.emit("cancel-role", { roomId }, (response: any) => {
        clearTimeout(timeout);
        resolve(response ?? {});
      });
    });
  },

  onRoleCancelled: (
    callback: (data: {
      userId: string;
      teamId: string;
      memberId: string;
    }) => void,
  ) => {
    roleSelectionSocket?.on("role-cancelled", callback);
  },

  onRoleSelected: (callback: (data: any) => void) => {
    roleSelectionSocket?.on("role-selected", callback);
  },

  onRoleSelectionCompleted: (callback: (data: any) => void) => {
    roleSelectionSocket?.on("role-selection-completed", callback);
  },

  onRoleSelectionNavigation: (callback: (data: { target: string }) => void) => {
    roleSelectionSocket?.on("role-selection-navigation", callback);
  },

  onRoleSelectionStarted: (callback: (data: any) => void) => {
    roleSelectionSocket?.on("role-selection-started", callback);
  },

  onTimerTick: (
    callback: (data: {
      timeRemaining: number;
      timerEndAt?: number | null;
    }) => void,
  ) => {
    roleSelectionSocket?.on("timer-tick", callback);
  },

  onRoleSelectionError: (callback: (data: any) => void) => {
    roleSelectionSocket?.on("role-selection-error", callback);
  },

  onSessionAborted: (callback: (data: any) => void) => {
    roleSelectionSocket?.on("session-aborted", callback);
  },

  offAllListeners: () => {
    roleSelectionSocket?.off("role-selected");
    roleSelectionSocket?.off("role-cancelled");
    roleSelectionSocket?.off("role-selection-completed");
    roleSelectionSocket?.off("role-selection-navigation");
    roleSelectionSocket?.off("role-selection-started");
    roleSelectionSocket?.off("timer-tick");
    roleSelectionSocket?.off("timer-extended");
    roleSelectionSocket?.off("role-selection-error");
    roleSelectionSocket?.off("session-aborted");
  },
};

export const disconnectRoleSelectionSocket = () => {
  roleSelectionSocketHelpers.offAllListeners();
  roleSelectionSocket?.off("connect");
  roleSelectionSocket?.off("disconnect");
  roleSelectionSocket?.disconnect();
  roleSelectionSocket = null;
};

// ============================================================
// 게임 소켓 일괄 해제 유틸
// 게임 플로우(경매·드래프트·역할선택·매치) 단계를 벗어날 때
// 이 함수 하나로 네 개의 게임 소켓을 한 번에 정리할 수 있다.
// 상시 소켓(presence, notification, dm, clan, room)에는 영향 없음.
//
// ※ 각 스토어(auction-store, snake-draft-store, match-store, role-selection-store)가
//    자체적으로 개별 disconnect 함수를 호출하므로 일반 플로우에서는 직접 호출하지 않는다.
//    긴급 초기화·로그아웃 등 일괄 정리가 필요한 경우에만 사용한다.
// ============================================================
export const disconnectGameSockets = () => {
  disconnectAuctionSocket();
  disconnectSnakeDraftSocket();
  disconnectMatchSocket();
  disconnectRoleSelectionSocket();
};

// ============================================================
// 디버그 유틸 — 현재 연결된 소켓 수 반환
// 개발·디버깅 목적으로만 사용한다. 프로덕션 렌더링 로직에는 사용하지 말 것.
// ============================================================
export const getConnectedSocketCount = (): number => {
  const sockets: Array<Socket | null> = [
    roomSocket,
    auctionSocket,
    snakeDraftSocket,
    matchSocket,
    clanSocket,
    presenceSocket,
    notificationSocket,
    dmSocket,
    roleSelectionSocket,
  ];
  return sockets.filter((s) => s?.connected).length;
};
