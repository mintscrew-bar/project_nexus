import {
  Megaphone,
  MessageCircle,
  Lightbulb,
  HelpCircle,
  MessagesSquare,
  Newspaper,
  Sword,
  Trophy,
  Users,
  Star,
  Flame,
  BookOpen,
  Pin,
} from "lucide-react";

/**
 * 게시판 iconName(lucide 아이콘명) → 컴포넌트 매핑.
 * 관리자가 입력하는 iconName 문자열을 실제 아이콘으로 변환한다.
 * 미지정/미등록 이름은 기본 아이콘(MessagesSquare)으로 폴백한다.
 */
export const BOARD_ICONS: Record<string, React.ElementType> = {
  Megaphone,
  MessageCircle,
  Lightbulb,
  HelpCircle,
  MessagesSquare,
  Newspaper,
  Sword,
  Trophy,
  Users,
  Star,
  Flame,
  BookOpen,
  Pin,
};

export function resolveBoardIcon(name?: string | null): React.ElementType {
  return (name && BOARD_ICONS[name]) || MessagesSquare;
}
