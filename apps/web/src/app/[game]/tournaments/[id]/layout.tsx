import type { Metadata } from "next";
import { GAMES } from "@nexus/types";
import { absoluteUrl } from "@/lib/seo";

// 서버에서 API를 직접 호출하므로 NEXT_PUBLIC_API_URL 사용 (sitemap.ts와 동일 패턴)
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// 공유 카드 기본 이미지 (방마다 동적 생성하지 않고 고정 배너 사용)
const SHARE_IMAGE = absoluteUrl("/images/nexus2.png");

type RoomShareInfo = {
  id: string;
  name: string;
  /** 서버가 붙인 표시 제목 — 배그 방이면 `[스배]` 같은 플랫폼 태그가 들어 있다 */
  displayName?: string;
  gameTitle?: "LOL" | "PUBG";
  teamMode: "AUCTION" | "SNAKE_DRAFT" | "AUTO_BALANCE" | "MANUAL_TEAM";
  status: string;
  isPrivate: boolean;
  maxParticipants: number;
  participantCount: number;
  hostName: string | null;
};

function modeLabel(mode: RoomShareInfo["teamMode"]): string {
  switch (mode) {
    case "AUCTION":
      return "경매 내전";
    case "SNAKE_DRAFT":
      return "스네이크 드래프트 내전";
    case "AUTO_BALANCE":
      return "자동 밸런스 내전";
    case "MANUAL_TEAM":
      return "자유 팀 선택 내전";
  }
}

// 룸은 휘발성이라 검색 색인은 막되(noindex) 디스코드·카카오 공유 카드는 동작시킨다.
const NOINDEX = { index: false, follow: false } as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ game: string; id: string }>;
}): Promise<Metadata> {
  const { game: gameSlug, id } = await params;

  // 방 정보를 못 가져오면(삭제·종료 등) 일반 내전 메타데이터로 폴백
  const fallback: Metadata = {
    title: "내전 방",
    description: "Nexus에서 내전 방에 참여하세요.",
    robots: NOINDEX,
  };

  try {
    const res = await fetch(`${API_BASE}/api/rooms/${id}/share`, {
      // 휘발성 데이터 — 짧게 캐시해 크롤러 반복 호출 부담만 덜어준다
      next: { revalidate: 30 },
    });
    if (!res.ok) return fallback;

    const room = (await res.json()) as RoomShareInfo | null;
    if (!room) return fallback;

    const label = modeLabel(room.teamMode);
    const headcount = `${room.participantCount}/${room.maxParticipants}명`;
    // 공유 카드에는 배지를 그릴 수 없어 제목에 플랫폼 태그가 담겨 온다.
    const roomName = room.displayName ?? room.name;
    const gameLabel =
      (room.gameTitle && GAMES[room.gameTitle]?.label) ?? "롤";
    const title = `${roomName} · ${label}`;
    const description = `${headcount} · ${label}${
      room.hostName ? ` · 방장 ${room.hostName}` : ""
    } — 지금 Nexus에서 ${gameLabel} 내전에 참여하세요.`;
    // 링크는 실제 서비스 경로여야 한다. 옛 경로를 쓰면 공유할 때마다 308을 한 번 더 탄다.
    const url = absoluteUrl(`/${gameSlug}/tournaments/${id}/lobby`);
    const cardTitle = `[${label}] ${roomName}`;

    return {
      title,
      description,
      robots: NOINDEX,
      openGraph: {
        title: cardTitle,
        description,
        url,
        type: "website",
        images: [{ url: SHARE_IMAGE, width: 1200, height: 630 }],
      },
      twitter: {
        card: "summary_large_image",
        title: cardTitle,
        description,
        images: [SHARE_IMAGE],
      },
    };
  } catch {
    return fallback;
  }
}

export default function RoomShareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
