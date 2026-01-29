import { io, Socket } from "socket.io-client";
import { getAccessToken } from "./api-client";

// Socket.io 클라이언트 인스턴스
let roomSocket: Socket | null = null;
let auctionSocket: Socket | null = null;
let snakeDraftSocket: Socket | null = null;
let matchSocket: Socket | null = null;
let clanSocket: Socket | null = null;

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Room Socket 연결
export const connectRoomSocket = () => {
  if (roomSocket?.connected) return roomSocket;

  roomSocket = io(`${SOCKET_URL}/room`, {
    auth: {
      token: getAccessToken(),
    },
    transports: ["websocket"],
  });

  roomSocket.on("connect", () => {
    console.log("✅ Room Socket Connected");
  });

  roomSocket.on("disconnect", () => {
    console.log("❌ Room Socket Disconnected");
  });

  roomSocket.on("error", (error) => {
    console.error("Room Socket Error:", error);
  });

  return roomSocket;
};

// Auction Socket 연결
export const connectAuctionSocket = () => {
  if (auctionSocket?.connected) return auctionSocket;

  auctionSocket = io(`${SOCKET_URL}/auction`, {
    auth: {
      token: getAccessToken(),
    },
    transports: ["websocket"],
  });

  auctionSocket.on("connect", () => {
    console.log("✅ Auction Socket Connected");
  });

  auctionSocket.on("disconnect", () => {
    console.log("❌ Auction Socket Disconnected");
  });

  auctionSocket.on("error", (error) => {
    console.error("Auction Socket Error:", error);
  });

  return auctionSocket;
};

// Snake Draft Socket 연결
export const connectSnakeDraftSocket = () => {
  if (snakeDraftSocket?.connected) return snakeDraftSocket;

  snakeDraftSocket = io(`${SOCKET_URL}/snake-draft`, {
    auth: {
      token: getAccessToken(),
    },
    transports: ["websocket"],
  });

  snakeDraftSocket.on("connect", () => {
    console.log("✅ Snake Draft Socket Connected");
  });

  snakeDraftSocket.on("disconnect", () => {
    console.log("❌ Snake Draft Socket Disconnected");
  });

  snakeDraftSocket.on("error", (error) => {
    console.error("Snake Draft Socket Error:", error);
  });

  return snakeDraftSocket;
};

// Match Socket 연결
export const connectMatchSocket = () => {
  if (matchSocket?.connected) return matchSocket;

  matchSocket = io(`${SOCKET_URL}/match`, {
    auth: {
      token: getAccessToken(),
    },
    transports: ["websocket"],
  });

  matchSocket.on("connect", () => {
    console.log("✅ Match Socket Connected");
  });

  matchSocket.on("disconnect", () => {
    console.log("❌ Match Socket Disconnected");
  });

  matchSocket.on("error", (error) => {
    console.error("Match Socket Error:", error);
  });

  return matchSocket;
};

// Clan Socket 연결
export const connectClanSocket = () => {
  if (clanSocket?.connected) return clanSocket;

  clanSocket = io(`${SOCKET_URL}/clan`, {
    auth: {
      token: getAccessToken(),
    },
    transports: ["websocket"],
  });

  clanSocket.on("connect", () => {
    console.log("✅ Clan Socket Connected");
  });

  clanSocket.on("disconnect", () => {
    console.log("❌ Clan Socket Disconnected");
  });

  clanSocket.on("error", (error) => {
    console.error("Clan Socket Error:", error);
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
    roomSocket?.on("room-update", callback);
  },

  onParticipantJoined: (callback: (data: any) => void) => {
    roomSocket?.on("participant-joined", callback);
  },

  onParticipantLeft: (callback: (data: any) => void) => {
    roomSocket?.on("participant-left", callback);
  },

  onParticipantReady: (callback: (data: any) => void) => {
    roomSocket?.on("participant-ready", callback);
  },

  onNewMessage: (callback: (data: any) => void) => {
    roomSocket?.on("new-message", callback);
  },

  offAllListeners: () => {
    roomSocket?.off("room-update");
    roomSocket?.off("participant-joined");
    roomSocket?.off("participant-left");
    roomSocket?.off("participant-ready");
    roomSocket?.off("new-message");
    roomSocket?.off("room-list-updated");
  },
};

// Auction Socket 헬퍼 함수
export const auctionSocketHelpers = {
  joinAuction: (roomId: string) => {
    auctionSocket?.emit("join-room", { roomId });  // ✅ Fixed: join-auction → join-room
  },

  placeBid: (roomId: string, amount: number) => {
    auctionSocket?.emit("place-bid", { roomId, amount });
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

  offAllListeners: () => {
    auctionSocket?.off("auction-started");
    auctionSocket?.off("bid-placed");  // ✅ Fixed
    auctionSocket?.off("player-sold");
    auctionSocket?.off("player-unsold");
    auctionSocket?.off("auction-complete");
    auctionSocket?.off("timer-update");
    auctionSocket?.off("bid-resolved");  // ✅ Added
    auctionSocket?.off("timer-expired");  // ✅ Added
  },
};

// Snake Draft Socket 헬퍼 함수
export const snakeDraftSocketHelpers = {
  joinDraft: (roomId: string) => {
    snakeDraftSocket?.emit("join-draft-room", { roomId });
  },

  makePick: (roomId: string, playerId: string) => {
    snakeDraftSocket?.emit("make-pick", { roomId, playerId });
  },

  getDraftState: (roomId: string) => {
    snakeDraftSocket?.emit("get-draft-state", { roomId });
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

  offAllListeners: () => {
    snakeDraftSocket?.off("draft-started");
    snakeDraftSocket?.off("pick-made");
    snakeDraftSocket?.off("draft-complete");
    snakeDraftSocket?.off("timer-update");
    snakeDraftSocket?.off("draft-state");
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

  onMatchCompleted: (callback: (data: any) => void) => {
    matchSocket?.on("match-completed", callback);
  },

  onBracketUpdate: (callback: (data: any) => void) => {
    matchSocket?.on("bracket-update", callback);
  },

  offAllListeners: () => {
    matchSocket?.off("bracket-generated");
    matchSocket?.off("match-started");
    matchSocket?.off("match-completed");
    matchSocket?.off("bracket-update");
  },
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

  offAllListeners: () => {
    clanSocket?.off("new-message");
    clanSocket?.off("member-joined");
    clanSocket?.off("member-left");
    clanSocket?.off("clan-update");
  },
};

// 모든 소켓 연결 해제
export const disconnectAllSockets = () => {
  roomSocket?.disconnect();
  auctionSocket?.disconnect();
  snakeDraftSocket?.disconnect();
  matchSocket?.disconnect();
  clanSocket?.disconnect();

  roomSocket = null;
  auctionSocket = null;
  snakeDraftSocket = null;
  matchSocket = null;
  clanSocket = null;
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
