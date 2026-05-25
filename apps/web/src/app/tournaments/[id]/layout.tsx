import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

// 서버에서 API를 직접 호출하므로 NEXT_PUBLIC_API_URL 사용 (sitemap.ts와 동일 패턴)
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// 공유 카드 기본 이미지 (방마다 동적 생성하지 않고 고정 배너 사용)
const SHARE_IMAGE = absoluteUrl("/images/nexus2.png");

type RoomShareInfo = {
  id: string;
  name: string;
  teamMode: "AUCTION" | "SNAKE_DRAFT";
  status: string;
  isPrivate: boolean;
  maxParticipants: number;
  participantCount: number;
  hostName: string | null;
};

function modeLabel(mode: RoomShareInfo["teamMode"]): string {
  return mode === "AUCTION" ? "경매 내전" : "스네이크 드래프트 내전";
}

// 룸은 휘발성이라 검색 색인은 막되(noindex) 디스코드·카카오 공유 카드는 동작시킨다.
const NOINDEX = { index: false, follow: false } as const;

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  // 방 정보를 못 가져오면(삭제·종료 등) 일반 내전 메타데이터로 폴백
  const fallback: Metadata = {
    title: "롤 내전 방",
    description: "Nexus에서 롤 내전 방에 참여하세요.",
    robots: NOINDEX,
  };

  try {
    const res = await fetch(`${API_BASE}/api/room/${params.id}/share`, {
      // 휘발성 데이터 — 짧게 캐시해 크롤러 반복 호출 부담만 덜어준다
      next: { revalidate: 30 },
    });
    if (!res.ok) return fallback;

    const room = (await res.json()) as RoomShareInfo | null;
    if (!room) return fallback;

    const label = modeLabel(room.teamMode);
    const headcount = `${room.participantCount}/${room.maxParticipants}명`;
    const title = `${room.name} · ${label}`;
    const description = `${headcount} · ${label}${
      room.hostName ? ` · 방장 ${room.hostName}` : ""
    } — 지금 Nexus에서 롤 내전에 참여하세요.`;
    const url = absoluteUrl(`/tournaments/${params.id}/lobby`);
    const cardTitle = `[${label}] ${room.name}`;

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
