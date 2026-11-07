import { createHash, createHmac, timingSafeEqual } from "crypto";
import { RoomStatus } from "@nexus/database";
import { PrismaService } from "../prisma/prisma.service";

/**
 * 방송 토큰(원문) → SHA-256 hash. 저장/조회 공통.
 */
export function hashBroadcastToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * ── 조작 패널 미리보기 토큰 ──
 *
 * 방송 토큰 원문은 발급 순간에만 보여 주고 해시로만 저장한다. 그래서 조작 패널이
 * "지금 OBS 에 나가는 화면"을 띄우려 해도 원문이 없다. 대신 로그인한 본인에게
 * 짧게 사는 서명 토큰을 발급해, 같은 오버레이 페이지를 그 토큰으로 연다.
 *
 * 형식: pv_<base64url(JSON {u, e})>.<서명>
 *  - u: 방송인 userId, e: 만료 시각(ms)
 *  - 서명: HMAC-SHA256(JWT_ACCESS_SECRET, 앞부분)
 * 읽기 전용 스냅샷·선수 프로필·소켓 구독에만 쓰이고, 조작(쓰기)에는 쓰이지 않는다.
 */
export const PREVIEW_TOKEN_PREFIX = "pv_";
export const PREVIEW_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function previewSecret(): string | null {
  return process.env.JWT_ACCESS_SECRET || null;
}

function signPreview(body: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`broadcast-preview:${body}`)
    .digest("base64url");
}

/** 미리보기 토큰 발급. 비밀키가 없으면(설정 누락) null */
export function createPreviewToken(
  userId: string,
  now = Date.now(),
  ttlMs = PREVIEW_TOKEN_TTL_MS,
): { token: string; expiresAt: number } | null {
  const secret = previewSecret();
  if (!secret) return null;
  const expiresAt = now + ttlMs;
  const body = Buffer.from(
    JSON.stringify({ u: userId, e: expiresAt }),
  ).toString("base64url");
  return {
    token: `${PREVIEW_TOKEN_PREFIX}${body}.${signPreview(body, secret)}`,
    expiresAt,
  };
}

/** 미리보기 토큰 검증 → userId. 형식·서명·만료 중 하나라도 어긋나면 null */
export function verifyPreviewToken(
  token: string,
  now = Date.now(),
): string | null {
  if (!token?.startsWith(PREVIEW_TOKEN_PREFIX)) return null;
  const secret = previewSecret();
  if (!secret) return null;
  const [body, sig] = token.slice(PREVIEW_TOKEN_PREFIX.length).split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(signPreview(body, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof payload?.u !== "string" || typeof payload?.e !== "number") {
      return null;
    }
    return payload.e > now ? payload.u : null;
  } catch {
    return null;
  }
}

/**
 * 방송 링크 토큰 → 방송인을 찾는 where 절.
 * 미리보기 토큰이면 서명으로 확인한 userId, 아니면 OBS 토큰 해시로 찾는다.
 * 미리보기 형식인데 검증에 실패하면 어떤 유저와도 맞지 않는 조건을 돌려준다.
 */
export function broadcastStreamerWhere(
  token: string,
): { id: string } | { broadcastTokenHash: string } {
  if (token.startsWith(PREVIEW_TOKEN_PREFIX)) {
    // 빈 문자열 id 는 존재하지 않으므로 "없음"으로 처리된다
    return { id: verifyPreviewToken(token) ?? "" };
  }
  return { broadcastTokenHash: hashBroadcastToken(token) };
}

/**
 * 스트리머가 지금 송출 중인 방 id를 해석한다.
 * 1) 수동 오버라이드(broadcastLiveRoomId)가 여전히 내 방이고 종료 전이면 그 방
 * 2) 아니면 내가 호스트인 가장 최근 활성(미종료) 방
 * 활성 방이 없으면(대기 상태) null.
 */
export async function activeRoomIdForUser(
  prisma: PrismaService,
  userId: string,
  liveRoomId: string | null,
): Promise<string | null> {
  if (liveRoomId) {
    const override = await prisma.room.findFirst({
      where: {
        id: liveRoomId,
        hostId: userId,
        status: { not: RoomStatus.COMPLETED },
      },
      select: { id: true },
    });
    if (override) return override.id;
  }

  const latest = await prisma.room.findFirst({
    where: { hostId: userId, status: { not: RoomStatus.COMPLETED } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return latest?.id ?? null;
}

/**
 * 방송 토큰(원문) → 현재 송출 중인 방 id. 토큰이 유효하지 않거나 활성 방이 없으면 null.
 * (소켓 인증처럼 방 id만 필요할 때 사용)
 */
export async function resolveBroadcastRoomId(
  prisma: PrismaService,
  token: string,
): Promise<string | null> {
  if (!token) return null;
  const user = await prisma.user.findUnique({
    where: broadcastStreamerWhere(token),
    select: { id: true, broadcastLiveRoomId: true },
  });
  if (!user) return null;
  return activeRoomIdForUser(prisma, user.id, user.broadcastLiveRoomId);
}
