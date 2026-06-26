# 클랜 정체성·모집 강화 — 설계

> 작성일: 2026-06-26
> 방향: 클랜을 "채팅되는 모임"에서 "정체성과 모집이 살아있는 팀"으로.
> 선행 작업: `TODO_clan_improvement.md`(Task 1~23, 소셜 셸 완료)
> ※ 경쟁 주체화(클랜전·클랜 리더보드)는 이번 범위에서 **제외**. 별도 트랙으로 후속.

---

## 배경 / 문제

현재 클랜은 소셜 기능(채팅·공지·초대·멤버관리)은 탄탄하지만, **시각적 정체성**과 **모집 경험**이 비어 있다.

- `Clan.logo` 필드는 스키마·UI에 있으나 **create/update DTO에 없어 실제로 설정할 방법이 없다** → 항상 null. UI는 조건부 렌더만 함.
- 배너·클랜 컬러·엠블럼 fallback 개념 없음. 모든 클랜이 회색 박스로 보임.
- 모집은 `isRecruiting` 불리언 + `minTier`뿐. 모집 공고문·모집 포지션·활동 시간대 같은 "왜 우리 클랜에 와야 하는지"가 없음.
- 브라우저 필터는 이름/태그 검색 + 모집 토글 + 정렬(`ranking`은 createdAt 폴백 스텁). 최소 티어·포지션·활동성 필터 없음.
- 클랜 태그가 앱 25곳에서 제각각 렌더됨(색·크기·라운드 불일치).

## 목표

1. 모든 클랜이 **로고/엠블럼 + 컬러 + (선택)배너**로 자기 정체성을 가진다.
2. 모집 클랜이 **공고문 + 모집 포지션 + 최소 티어 + 활동성**으로 어필하고, 가입 희망자가 **필터로 탐색**할 수 있다.
3. 클랜 태그/엠블럼 표기를 **공통 컴포넌트로 일관화**한다.

---

## 설계 결정 (구현 전 확정 대상 — 리뷰 바람)

### 스키마 추가 필드 (`model Clan`)
| 필드 | 타입 | 용도 |
|------|------|------|
| `banner` | `String?` | 상세 페이지 히어로 배경 이미지 URL |
| `accentColor` | `String?` | 클랜 대표 색(hex). 태그 배지·엠블럼 fallback·히어로에 적용. 기본값은 앱 accent(#667EEA) |
| `recruitRoles` | `String[]` | 모집 중인 포지션(TOP/JUNGLE/MID/ADC/SUPPORT) |
| `lastActiveAt` | `DateTime?` | 활동성 정렬용. 채팅·가입·공지 등 이벤트 시 갱신(무거운 집계 회피용 경량 신호) |

- `logo`(기존)·`minTier`(기존)는 그대로 활용. 이번에 **DTO 연결**해서 실제 설정 가능하게 함.
- **모집 공고는 기존 `description` 하나로 통일** (별도 `recruitMessage` 두지 않음). 모집 어필도 description에서 작성.
- 인덱스: `@@index([minTier])`, `@@index([lastActiveAt])` 추가 검토.
- **마이그레이션**: 이 호스트는 운영 상주 → `dev compose` 금지. 스키마 반영은 `prisma migrate deploy`로. (참고: 메모리 `dev_compose_kills_prod`)

### 이미지 업로드
- 신규 인프라 만들지 않고 **기존 `upload.service` 재사용**. 클랜 로고/배너 전용 엔드포인트만 추가(`POST /clans/:id/logo`, `POST /clans/:id/banner`, multipart). 권한은 `canManageSettings`.

### 공통 컴포넌트
- `<ClanEmblem>` — 로고 있으면 이미지, 없으면 `accentColor` 배경 + 태그 이니셜. size prop.
- `<ClanTag>` — `accentColor` 적용된 태그 배지. 현재 25곳 제각각 렌더를 점진 교체(우선 카드·상세·사이드바·프로필 모달).

### 모집 포지션 표현
- `recruitRoles: String[]`로 단순 저장. UI는 포지션 아이콘 토글(이미 `PositionIcon`·`POSITION_LABELS` 존재) 재사용.

---

## Tasks

### Phase 1 — 정체성 기반 (데이터·업로드·공통 컴포넌트)

- [x] Task 1: 스키마 확장 (`Clan.banner`/`accentColor`/`recruitRoles`/`lastActiveAt`) + 인덱스, 마이그레이션 SQL 작성 (DB 반영은 배포 시 `migrate deploy` — 이 호스트에서 DB 미연결)
- [x] Task 2: 백엔드 — create/update DTO에 `logo`/`banner`/`accentColor`/`recruitRoles` 추가, 검증(hex 형식·포지션 enum·길이)
- [x] Task 3: 백엔드 — 클랜 로고/배너 업로드 엔드포인트(`upload.service` 재사용, `canManageSettings` 권한)
- [x] Task 4: 프론트 공통 컴포넌트 `ClanEmblem`/`ClanTag` 신설(로고 fallback 이니셜 + `accentColor`)

### Phase 2 — 생성·설정·상세 UI

- [x] Task 5: 클랜 생성 페이지 — 로고/배너 업로더 + 컬러 선택(프리뷰 연동)
- [x] Task 6: 설정 페이지 — 로고/배너/컬러 편집 섹션 추가
- [x] Task 7: 상세 페이지 히어로 리디자인 — 배너 배경 + `ClanEmblem` + 컬러 + 태그 + 핵심 지표(멤버수/최소티어/모집상태)

### Phase 3 — 모집 강화

- [x] Task 8: 백엔드 — `listClans` 필터 확장(`minTier`·`recruitRoles`) + 정렬 '활동순'(`lastActiveAt`) 추가, `lastActiveAt` 갱신 훅(채팅/가입/공지)
- [x] Task 9: 브라우저 필터 UI — 최소 티어 필터, 모집 포지션 필터, '활동순' 정렬 옵션
- [x] Task 10: 클랜 카드 정보 강화 — `accentColor` 적용, 최소 티어·모집 포지션 배지, 활동성 표시, `ClanEmblem` 적용
- [ ] Task 11: 상세 정보 탭 '모집 공고' 섹션 — `description` + 모집 포지션·최소 티어 표시, OWNER/OFFICER 인라인 편집

### Phase 4 — 멤버 정체성 + 마무리

- [ ] Task 12: 멤버 탭 카드 polish — 포지션 아이콘·티어 배지·가입일, 역할별 그룹핑
- [ ] Task 13: 앱 전반 클랜 태그 표기 `ClanTag`로 통일(프로필 모달·친구 패널·로비 등 잔여 교체)
- [ ] Task 14: 전체 빌드·린트 검증 + 문서 마무리

---

## 범위 밖 (후속 트랙)
- 클랜전(Room/Match에 clanId 연결), 클랜 간 리더보드, 클랜 점수/시즌 — 별도 설계 문서로.
- Discord 길드 연동 심화(이미 `DiscordGuildLink` 존재) — 본 트랙과 독립.
