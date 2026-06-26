# 프로필 모달 ↔ 공개 프로필 불일치 수정

PlayerProfileModal과 /users/[id] 공개 프로필 페이지 간 데이터·UX·스타일 불일치 목록.

---

## Tasks

- [x] Task 1: 평판 필드명 버그 수정 (`/profile` 페이지)
  - `rep.skill` → `rep.averageSkill`
  - `rep.manner` → `rep.averageAttitude`
  - `rep.communication` → `rep.averageCommunication`
  - `rep.totalVotes` → `rep.totalRatings`
  - 파일: `apps/web/src/app/profile/page.tsx` (line 1643~1647)
  - **현재 평판 항상 0으로 표시되는 실제 버그**

- [x] Task 2: 모달에서 privacy 설정 반영
  - `showRiotAccounts` false 시 Riot 계정·티어 숨김
  - `showChampionStats` false 시 선호 챔피언 숨김
  - 파일: `apps/web/src/components/domain/PlayerProfileModal.tsx`
  - 참고: 공개 프로필 `page.tsx` line 550~551 로직

- [ ] Task 3: 모달에 bio(자기소개) 추가
  - 공개 프로필은 `profile.bio` 표시, 모달은 누락
  - 파일: `apps/web/src/components/domain/PlayerProfileModal.tsx`

- [ ] Task 4: 모달에 스트리머 정보 추가
  - `streamerProfiles` (채널 링크 배지), `streamerLinks` (추가 링크 카드) 표시
  - 공개 프로필 line 606~628 참고
  - 파일: `apps/web/src/components/domain/PlayerProfileModal.tsx`

- [ ] Task 5: 모달 테마 토큰화 (하드코딩 다크 제거)
  - `bg-[#101010]`, `bg-[#181818]`, `text-white`, `zinc-*` → `bg-bg-*`, `text-text-*` 토큰으로 교체
  - 현재 60군데 이상 하드코딩, 라이트모드 대응 불가
  - 파일: `apps/web/src/components/domain/PlayerProfileModal.tsx`

- [ ] Task 6: RepBar / SummaryChip / WinRateSparkline 공통 컴포넌트로 추출
  - 현재 모달·`/profile`·`/users/[id]` 3곳에 각각 별도 구현
  - `src/components/domain/` 또는 `src/components/ui/` 하위로 분리
  - 높이(min-h-[104px] vs min-h-[96px]), 색상, 정렬이 제각각

- [ ] Task 7: 모달 클랜 클릭 → 클랜 페이지 이동 추가
  - 공개 프로필은 `/clans/${clan.id}` 이동 가능, 모달은 태그만 텍스트 표시
  - 파일: `apps/web/src/components/domain/PlayerProfileModal.tsx` (line 408~413)
