// 기능 가이드(/guide) 섹션 목차 — 페이지 본문과 좌측 사이드바가 공유한다.
// id는 각 섹션의 anchor id와 일치해야 한다.
export interface GuideTocItem {
  id: string;
  label: string;
}

export const GUIDE_TOC: GuideTocItem[] = [
  { id: "start", label: "방 만들기·준비" },
  { id: "team-modes", label: "팀 구성 방식" },
  { id: "draft", label: "경매·스네이크" },
  { id: "quick-team", label: "자동·자유 선택" },
  { id: "roles", label: "역할 선택" },
  { id: "bracket", label: "대진표" },
  { id: "discord", label: "디스코드 연동" },
  { id: "bot-setup", label: "봇 추가·세팅" },
  { id: "bot-commands", label: "봇 명령어" },
  { id: "stats", label: "전적·클랜·랭킹" },
  { id: "faq", label: "자주 묻는 질문" },
];
