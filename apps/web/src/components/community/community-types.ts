// 커뮤니티 공통 타입, 상수, 유틸 모음

export type PostCategory = "NOTICE" | "FREE" | "TIP" | "QNA";
export type PostContentFormat = "MARKDOWN" | "RICHTEXT";
export type SortOption = "newest" | "popular" | "views" | "comments";

/** 게시글에 포함되는 게시판 요약 정보 */
export interface PostBoard {
  id: string;
  slug: string;
  name: string;
  fullName: string | null;
  iconName: string | null;
  color: string | null;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  contentFormat?: PostContentFormat;
  contentJson?: unknown;
  /** 레거시 카테고리 (nullable — 커스텀 게시판 글은 null) */
  category: PostCategory | null;
  /** 소속 게시판 (신규) */
  board?: PostBoard | null;
  views: number;
  isPinned: boolean;
  createdAt: string;
  author: {
    id: string;
    username: string;
    avatar: string | null;
  };
  _count?: {
    comments: number;
    likes: number;
  };
}

export const POSTS_PER_PAGE = 20;

// 카테고리별 메타 정보 (아이콘은 문자열 name으로 저장 — 컴포넌트에서 동적 import)
export const CATEGORY_KEYS: PostCategory[] = ["NOTICE", "FREE", "TIP", "QNA"];

// 카테고리 label/color 매핑 (아이콘 컴포넌트는 포함하지 않음 — 순수 TS 파일 유지)
export const CATEGORY_META: Record<
  PostCategory,
  { label: string; fullLabel: string; iconName: string; color: string }
> = {
  NOTICE: {
    label: "공지",
    fullLabel: "공지사항",
    iconName: "Megaphone",
    color: "text-accent-danger",
  },
  FREE: {
    label: "자유",
    fullLabel: "자유게시판",
    iconName: "MessageCircle",
    color: "text-text-secondary",
  },
  TIP: {
    label: "팁",
    fullLabel: "팁 & 노하우",
    iconName: "Lightbulb",
    color: "text-accent-gold",
  },
  QNA: {
    label: "Q&A",
    fullLabel: "Q&A",
    iconName: "HelpCircle",
    color: "text-accent-primary",
  },
};

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "최신순" },
  { value: "popular", label: "인기순" },
  { value: "views", label: "조회순" },
  { value: "comments", label: "댓글순" },
];

/** 게시글 작성 시각을 사람이 읽기 쉬운 형태로 변환 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return date.toLocaleDateString("ko-KR");
}
