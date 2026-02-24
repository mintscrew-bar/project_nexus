import { io, Socket } from "socket.io-client";
import { getAccessToken } from "./api-client";

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

// Room Socket 연결
export const connectRoomSocket = () => {
  // Reuse existing instance if still connected or reconnecting.
  if (roomSocket?.connected || roomSocket?.active) return roomSocket;
  // Clean up stale disconnected socket before creating a new one.
  if (roomSocket) {
    roomSocket.removeAllListeners();
    roomSocket = null;
  }

  roomSocket = io(`${SOCKET_URL}/room`, {
    // Re-evaluate token for each connection/reconnection attempt.
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
  });

  roomSocket.on("connect", () => {
    console.log("✅ Room Socket Connected");
  });

  roomSocket.on("disconnect", () => {
    console.log("❌ Room Socket Disconnected");
  });

  roomSocket.on("connect_error", (error) => {
    console.error("Room Socket Connect Error:", error.message);
  });

  return roomSocket;
};

// Auction Socket 연결
export const connectAuctionSocket = () => {
  // Reuse existing instance if still connected or reconnecting.
  if (auctionSocket?.connected || auctionSocket?.active) return auctionSocket;
  // Clean up stale disconnected socket before creating a new one.
  if (auctionSocket) {
    auctionSocket.removeAllListeners();
    auctionSocket = null;
  }

  auctionSocket = io(`${SOCKET_URL}/auction`, {
    // Re-evaluate token for each connection/reconnection attempt.
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
  });

  auctionSocket.on("connect", () => {
    console.log("✅ Auction Socket Connected");
  });

  auctionSocket.on("disconnect", () => {
    console.log("❌ Auction Socket Disconnected");
  });

  auctionSocket.on("connect_error", (error) => {
    console.error("Auction Socket Connect Error:", error.message);
  });

  auctionSocket.on("error", (error) => {
    console.error("Auction Socket Error:", error);
  });

  return auctionSocket;
};

// Snake Draft Socket 연결
export const connectSnakeDraftSocket = () => {
  if (snakeDraftSocket?.connected || snakeDraftSocket?.active) return snakeDraftSocket;
  if (snakeDraftSocket) {
    snakeDraftSocket.removeAllListeners();
    snakeDraftSocket = null;
  }

  snakeDraftSocket = io(`${SOCKET_URL}/snake-draft`, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
  });

  snakeDraftSocket.on("connect", () => {
    console.log("✅ Snake Draft Socket Connected");
  });

  snakeDraftSocket.on("disconnect", () => {
    console.log("❌ Snake Draft Socket Disconnected");
  });

  snakeDraftSocket.on("connect_error", (error) => {
    console.error("Snake Draft Socket Connect Error:", error.message);
  });

  return snakeDraftSocket;
};

// Match Socket 연결
export const connectMatchSocket = () => {
  if (matchSocket?.connected || matchSocket?.active) return matchSocket;
  if (matchSocket) {
    matchSocket.removeAllListeners();
    matchSocket = null;
  }

  matchSocket = io(`${SOCKET_URL}/match`, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
  });

  matchSocket.on("connect", () => {
    console.log("✅ Match Socket Connected");
  });

  matchSocket.on("disconnect", () => {
    console.log("❌ Match Socket Disconnected");
  });

  matchSocket.on("connect_error", (error) => {
    console.error("Match Socket Connect Error:", error.message);
  });

  return matchSocket;
};

// Clan Socket 연결
export const connectClanSocket = () => {
  if (clanSocket?.connected || clanSocket?.active) return clanSocket;
  if (clanSocket) {
    clanSocket.removeAllListeners();
    clanSocket = null;
  }

  clanSocket = io(`${SOCKET_URL}/clan`, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
  });

  clanSocket.on("connect", () => {
    console.log("✅ Clan Socket Connected");
  });

  clanSocket.on("disconnect", () => {
    console.log("❌ Clan Socket Disconnected");
  });

  clanSocket.on("connect_error", (error) => {
    console.error("Clan Socket Connect Error:", error.message);
  });

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
    roomSocket?.emit("send-message", { roomId, message });
  },

  sendIsTyping: (roomId: string, isTyping: boolean) => {
    roomSocket?.emit("is-typing", { roomId, isTyping });
  },

  // Room list subscription
  subscribeRoomList: (callback: (response: any) => void) => {
    roomSocket?.emit("subscribe-room-list", {}, callback);
  },

  unsubscribeRoomList: () => {
    roomSocket?.emit("unsubscribe-room-list");
  },

  onRoomListUpdated: (callback: (rooms: any[]) => void) => {
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

  onUserTyping: (callback: (data: { userId: string; username: string }) => void) => {
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

  onNewBid: (callback: (data: any) => void) => {
    auctionSocket?.on("bid-placed", callback);  // ✅ Fixed: new-bid → bid-placed
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
    auctionSocket?.on("bid-resolved", callback);  // ✅ Added: missing event
  },

  onTimerExpired: (callback: (data: any) => void) => {
    auctionSocket?.on("timer-expired", callback);  // ✅ Added: missing event
  },

  // Captain selection events
  onCaptainSelectionPhase: (callback: (data: any) => void) => {
    auctionSocket?.on("captain-selection-phase", callback);
  },

  onVolunteerListUpdated: (callback: (data: any) => void) => {
    auctionSocket?.on("volunteer-list-updated", callback);
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
      const timeout = setTimeout(() => resolve({ error: "volunteer_timeout" }), 10000);
      auctionSocket.emit("volunteer-captain", { roomId }, (response: any) => {
        clearTimeout(timeout);
        resolve(response ?? {});
      });
    });
  },

  finalizeVolunteers: (roomId: string, selectedUserIds?: string[]): Promise<any> => {
    return new Promise((resolve) => {
      if (!auctionSocket?.connected) {
        resolve({ error: "소켓이 연결되어 있지 않습니다." });
        return;
      }
      const timeout = setTimeout(() => resolve({ error: "finalize_timeout" }), 10000);
      auctionSocket.emit("finalize-volunteers", { roomId, selectedUserIds }, (response: any) => {
        clearTimeout(timeout);
        resolve(response ?? {});
      });
    });
  },

  selectManualCaptains: (roomId: string, userIds: string[]): Promise<any> => {
    return new Promise((resolve) => {
      if (!auctionSocket?.connected) {
        resolve({ error: "소켓이 연결되어 있지 않습니다." });
        return;
      }
      const timeout = setTimeout(() => resolve({ error: "select_timeout" }), 10000);
      auctionSocket.emit("select-manual-captains", { roomId, userIds }, (response: any) => {
        clearTimeout(timeout);
        resolve(response ?? {});
      });
    });
  },

  offAllListeners: () => {
    auctionSocket?.off("auction-started");
    auctionSocket?.off("bid-placed");
    auctionSocket?.off("player-sold");
    auctionSocket?.off("player-unsold");
    auctionSocket?.off("auction-complete");
    auctionSocket?.off("timer-update");
    auctionSocket?.off("bid-resolved");
    auctionSocket?.off("timer-expired");
    auctionSocket?.off("captain-selection-phase");
    auctionSocket?.off("volunteer-list-updated");
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

        snakeDraftSocket?.emit("join-draft-room", { roomId }, (response: any) => {
          clearTimeout(ackTimeout);
          done(response ?? {});
        });
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
      snakeDraftSocket.emit(
        "get-draft-state",
        { roomId },
        (response: any) => {
          clearTimeout(timeout);
          resolve(response ?? {});
        },
      );
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
export const matchSocketHelpers = {
  joinMatch: (roomId: string) => {
    matchSocket?.emit("join-match-room", { roomId });
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

  offAllListeners: () => {
    matchSocket?.off("bracket-generated");
    matchSocket?.off("match-started");
    matchSocket?.off("match-result");
    matchSocket?.off("bracket-updated");
  },
};

// Presence Socket 연결
export const connectPresenceSocket = () => {
  if (presenceSocket?.connected || presenceSocket?.active) return presenceSocket;
  if (presenceSocket) {
    presenceSocket.removeAllListeners();
    presenceSocket = null;
  }

  presenceSocket = io(`${SOCKET_URL}/presence`, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
  });

  presenceSocket.on("connect", () => {
    console.log("✅ Presence Socket Connected");
  });

  presenceSocket.on("disconnect", () => {
    console.log("❌ Presence Socket Disconnected");
  });

  presenceSocket.on("connect_error", (error) => {
    console.error("Presence Socket Connect Error:", error.message);
  });

  return presenceSocket;
};

// Presence Socket 헬퍼 함수
export const presenceSocketHelpers = {
  setStatus: (status: "ONLINE" | "AWAY", callback?: (response: any) => void) => {
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

  onFriendStatusChanged: (callback: (data: { userId: string; status: string; lastSeenAt: string }) => void) => {
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
  joinClan: (clanId: string) => {
    clanSocket?.emit("join-clan", { clanId });
  },

  leaveClan: (clanId: string) => {
    clanSocket?.emit("leave-clan", { clanId });
  },

  sendMessage: (clanId: string, message: string) => {
    clanSocket?.emit("send-message", { clanId, message });
  },

  sendIsTyping: (clanId: string, isTyping: boolean) => {
    clanSocket?.emit("is-typing", { clanId, isTyping });
  },

  onNewMessage: (callback: (data: any) => void) => {
    clanSocket?.on("new-message", callback);
  },

  onMemberJoined: (callback: (data: any) => void) => {
    clanSocket?.on("member-joined", callback);
  },

  onMemberLeft: (callback: (data: any) => void) => {
    clanSocket?.on("member-left", callback);
  },

  onClanUpdate: (callback: (data: any) => void) => {
    clanSocket?.on("clan-update", callback);
  },

  onUserTyping: (callback: (data: { userId: string; username: string }) => void) => {
    clanSocket?.on("user-typing", callback);
  },

  onUserStoppedTyping: (callback: (data: { userId: string }) => void) => {
    clanSocket?.on("user-stopped-typing", callback);
  },

  offAllListeners: () => {
    clanSocket?.off("new-message");
    clanSocket?.off("member-joined");
    clanSocket?.off("member-left");
    clanSocket?.off("clan-update");
    clanSocket?.off("user-typing");
    clanSocket?.off("user-stopped-typing");
  },
};

// Notification Socket 연결
export const connectNotificationSocket = () => {
  if (notificationSocket?.connected || notificationSocket?.active) return notificationSocket;
  if (notificationSocket) {
    notificationSocket.removeAllListeners();
    notificationSocket = null;
  }

  notificationSocket = io(`${SOCKET_URL}/notification`, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
  });

  notificationSocket.on("connect", () => {
    console.log("✅ Notification Socket Connected");
  });

  notificationSocket.on("disconnect", () => {
    console.log("❌ Notification Socket Disconnected");
  });

  notificationSocket.on("connect_error", (error) => {
    console.error("Notification Socket Connect Error:", error.message);
  });

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
  if (dmSocket?.connected || dmSocket?.active) return dmSocket;

  // 기존 소켓 정리
  if (dmSocket) {
    dmSocket.removeAllListeners();
    dmSocket.disconnect();
    dmSocket = null;
  }

  dmSocket = io(`${SOCKET_URL}/dm`, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
  });

  dmSocket.on("connect", () => {
    console.log("✅ DM Socket Connected");
  });

  dmSocket.on("disconnect", () => {
    console.log("❌ DM Socket Disconnected");
  });

  dmSocket.on("connect_error", (error) => {
    console.error("DM Socket Connect Error:", error.message);
  });

  return dmSocket;
};

export const dmSocketHelpers = {
  sendMessage: (receiverId: string, content: string, callback?: (ack: any) => void) => {
    dmSocket?.emit("send-dm", { receiverId, content }, callback);
  },

  sendIsTyping: (receiverId: string, isTyping: boolean) => {
    dmSocket?.emit("is-typing", { receiverId, isTyping });
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

  onUserTyping: (callback: (data: { userId: string; username: string }) => void) => {
    dmSocket?.on("dm-typing", callback);
  },

  offUserTyping: (callback: (data: { userId: string; username: string }) => void) => {
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
  dmSocketHelpers.offAllListeners();
  dmSocket?.disconnect();
  dmSocket = null;
};

// 모든 소켓 연결 해제
export const disconnectAllSockets = () => {
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
  roomSocketHelpers.offAllListeners();
  roomSocket?.disconnect();
  roomSocket = null;
};

export const disconnectAuctionSocket = () => {
  auctionSocketHelpers.offAllListeners();
  auctionSocket?.disconnect();
  auctionSocket = null;
};

export const disconnectSnakeDraftSocket = () => {
  snakeDraftSocketHelpers.offAllListeners();
  snakeDraftSocket?.disconnect();
  snakeDraftSocket = null;
};

export const disconnectMatchSocket = () => {
  matchSocketHelpers.offAllListeners();
  matchSocket?.disconnect();
  matchSocket = null;
};

export const disconnectClanSocket = () => {
  clanSocketHelpers.offAllListeners();
  clanSocket?.disconnect();
  clanSocket = null;
};

// ========================================
// Role Selection Socket
// ========================================

export const connectRoleSelectionSocket = () => {
  if (roleSelectionSocket?.connected || roleSelectionSocket?.active) return roleSelectionSocket;
  if (roleSelectionSocket) {
    roleSelectionSocket.removeAllListeners();
    roleSelectionSocket = null;
  }

  roleSelectionSocket = io(`${SOCKET_URL}/role-selection`, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
  });

  roleSelectionSocket.on("connect", () => {
    console.log("Role selection socket connected");
  });

  roleSelectionSocket.on("disconnect", () => {
    console.log("Role selection socket disconnected");
  });

  roleSelectionSocket.on("connect_error", (error) => {
    console.error("Role Selection Socket Connect Error:", error.message);
  });

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
      roleSelectionSocket.emit("select-role", { roomId, role }, (response: any) => {
        clearTimeout(timeout);
        resolve(response ?? {});
      });
    });
  },

  onRoleSelected: (callback: (data: any) => void) => {
    roleSelectionSocket?.on("role-selected", callback);
  },

  onRoleSelectionCompleted: (callback: (data: any) => void) => {
    roleSelectionSocket?.on("role-selection-completed", callback);
  },

  onRoleSelectionStarted: (callback: (data: any) => void) => {
    roleSelectionSocket?.on("role-selection-started", callback);
  },

  onTimerTick: (callback: (data: { timeRemaining: number }) => void) => {
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
    roleSelectionSocket?.off("role-selection-completed");
    roleSelectionSocket?.off("role-selection-started");
    roleSelectionSocket?.off("timer-tick");
    roleSelectionSocket?.off("role-selection-error");
    roleSelectionSocket?.off("session-aborted");
  },
};

export const disconnectRoleSelectionSocket = () => {
  roleSelectionSocketHelpers.offAllListeners();
  roleSelectionSocket?.disconnect();
  roleSelectionSocket = null;
};
