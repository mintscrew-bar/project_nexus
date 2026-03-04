# 클랜 페이지 종합 개선 - 남은 작업

> 진행 기준일: 2026-03-04
> 완료: Task 1~10 / 전체: Task 1~23

---

## ✅ 완료된 작업

- [x] Task 1: Prisma 스키마 확장 (ClanInvitation/Announcement/ActivityLog) — edee4db
- [x] Task 2: DB 스키마 푸시 — edee4db
- [x] Task 3: 백엔드 채팅 커서 페이지네이션 + 메시지 소프트 삭제 — 38cf574
- [x] Task 4: 백엔드 활동 로그 (logActivity 헬퍼 + getActivityLogs) — 38cf574
- [x] Task 5: 백엔드 초대/가입 요청 시스템 (8개 메서드 + 엔드포인트) — 38cf574
- [x] Task 6: 백엔드 공지사항 CRUD + Socket 브로드캐스트 — 38cf574
- [x] Task 7: 백엔드 클랜 통계 API + listClans sort 옵션 — 38cf574
- [x] Task 8: 프론트엔드 api-client + socket-client 확장 — 2584f82
- [x] Task 9: 프론트엔드 clan-store 확장 (cursor/unread/announcements) — 2584f82
- [x] Task 10: 클랜 브라우저 카드 리디자인 (스켈레톤/배지/프로그레스바) — 230f2c7

---

## 🔲 남은 작업

- [ ] Task 11: 클랜 상세 페이지 탭 구조
**파일**: `apps/web/src/app/clans/[id]/page.tsx`
- Tabs 컴포넌트로 4개 탭 분리: 정보 / 멤버 / 채팅 / 통계
- 멤버 탭: presence-store 연동으로 StatusIndicator 온라인 상태 표시
- 역할 시각 강화: OWNER(골드 ring + Crown), OFFICER(블루 ring + Shield)
- 비멤버: 채팅/통계 탭 disabled

- [ ] Task 12: 정보 탭 공지사항 섹션
**파일**: `apps/web/src/app/clans/[id]/page.tsx`
- 정보 탭에 공지사항 카드 (멤버에게만 표시)
- OWNER/OFFICER: "공지 작성" 인라인 폼
- `clanApi.getAnnouncements(clanId)` 연동

- [ ] Task 13: ClanChat 채팅 개선
**파일**: `apps/web/src/components/domain/ClanChat.tsx`
- 무한 스크롤: 상단 스크롤 시 이전 메시지 로드 (`fetchMoreMessages`, 스크롤 위치 유지)
- 메시지 삭제: hover 시 휴지통 아이콘 (OWNER/OFFICER 또는 본인), `myRole` prop 추가
- URL 자동 링크: regex로 감지 → `<a>` 태그 래핑
- 날짜 구분선: 날짜 변경 시 구분선 삽입

- [ ] Task 14: 통계 탭 ClanStats 컴포넌트
**새 파일**: `apps/web/src/components/domain/ClanStats.tsx`
**수정**: `apps/web/src/app/clans/[id]/page.tsx`
- clanId prop, `getClanStats` 호출
- 집계 카드 그리드: 총 경기수, 승률, 총 승/패
- 멤버 랭킹 테이블: 순위, 아바타+유저명, 경기수, 승수, 패수, 승률
- stagger-children 애니메이션, 로딩 스켈레톤

- [ ] Task 15: 클랜 생성 페이지 UX 개선
**파일**: `apps/web/src/app/clans/create/page.tsx`
- 캐릭터 카운터 색상: `<60%` green, `<85%` orange, `≥85%` red
- 실시간 태그 프리뷰: `[TAG] 클랜이름` 미리보기 박스
- Floating label: peer CSS 패턴 활용

- [ ] Task 16: 플로팅 채팅 패널 개선
**파일**: `apps/web/src/components/domain/FloatingClanChatPanel.tsx`
- 읽지 않은 메시지 뱃지 (`unreadCount > 0`일 때 빨간 뱃지)
- 최소화 상태에서 새 메시지 → 헤더 pulse 애니메이션
- 드래그 리사이즈: panelHeight 상태 (min 200, max 600, default 420)

- [ ] Task 17: 설정 페이지 멤버 관리 UX
**파일**: `apps/web/src/app/clans/[id]/settings/page.tsx`
- 아이콘 버튼들 → Dropdown 컴포넌트로 교체 (MoreHorizontal 트리거)
- 멤버 검색 Input 추가
- 벌크 추방: 체크박스 + "선택 추방" 버튼

- [ ] Task 18: 설정 페이지 초대/가입 요청 관리
**파일**: `apps/web/src/app/clans/[id]/settings/page.tsx`
- 새 Card 섹션: "초대 & 가입 요청"
  - 초대 코드 생성/복사 (`generateInviteCode`)
  - 유저 직접 초대 (검색 + 초대 버튼)
  - 가입 요청 목록 (`getPendingJoinRequests`) + 수락/거절

- [ ] Task 19: 설정 페이지 활동 로그
**파일**: `apps/web/src/app/clans/[id]/settings/page.tsx`
- 새 Card 섹션: "활동 로그"
- ClanActivityType 한글 변환 헬퍼
- 색상 코딩: 가입(초록), 탈퇴/추방(빨강), 승급/이전(노랑), 기타(파랑)
- 커서 페이지네이션 "더 보기" 버튼

- [ ] Task 20: 가입 요청 플로우 연결
**파일**: `apps/web/src/app/clans/[id]/page.tsx` (이미 page.tsx에 부분 반영됨)
- 클랜 브라우저: "초대 코드로 가입" 모달 추가 (`joinByCode`)
- 클랜 상세: 가입 요청 버튼 (비모집 상태 처리)

- [ ] Task 21: 채팅 상단 공지 핀
**파일**: `apps/web/src/components/domain/ClanChat.tsx`
- 메시지 영역 상단에 접을 수 있는 공지 배너 추가
- `announcements` prop 또는 clan-store에서 가져오기

- [ ] Task 22: 사이드바 배지 연결
**파일**: `apps/web/src/components/layout/sidebar/ClansSidebarContent.tsx`
- clan-store의 `unreadCount` 연동
- 읽지 않은 메시지 있을 시 클랜명 옆 빨간 점/숫자 표시

- [ ] Task 23: 전체 빌드 및 린트 검증
```bash
pnpm build && pnpm lint
```
- 모든 타입 오류 및 lint 경고 수정
