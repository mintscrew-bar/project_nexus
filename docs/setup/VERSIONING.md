# 버전 관리 정책

이 프로젝트의 버전은 **main 에 머지되면 CI 가 자동으로** 올린다. 사람이 손댈 일은 거의 없다.

## 버전 체계

`MAJOR.MINOR.PATCH` (semver 형식). 다만 외부 API 소비자가 없는 **서비스(앱)** 이므로 각 자리의 의미는 다음과 같이 정의한다.

| 자리 | 올리는 경우 | 판정 |
|------|-------------|------|
| **MAJOR** | 대개편·정식 런칭 등 마일스톤 | **수동** (`pnpm bump major`) |
| **MINOR** | 유저가 체감하는 신규 기능(`feat`) | 자동 |
| **PATCH** | 버그수정·리팩터·성능·문서 + **인프라성 `feat`** | 자동 |

- **인프라 scope 의 `feat` 은 MINOR 로 안 올린다.** 화면에 노출되는 버전이라 유저와 무관한 작업으로 부풀리지 않기 위함이다.
  - 인프라로 취급하는 scope: `ci`, `deploy`, `build`, `infra`, `deps`, `release`, `chore`
  - 예: `feat(ci): 배포 실패 알림` → PATCH, `feat(clan): 토너먼트 탭` → MINOR
- **MAJOR 는 자동 판정하지 않는다.** `type!:` 나 본문 `BREAKING CHANGE` 가 있으면 자동 major 로 잡지만, 앱 특성상 드물다. 보통은 마일스톤에 수동 지정한다.

판정 단위는 **배포(=main 머지) 1회**. 한 번의 머지에 섞인 커밋 중 **가장 높은 등급**을 따른다(유저 `feat` 하나라도 있으면 그 릴리스는 MINOR).

## 자동화 동작 (평상시)

```
main 에 머지
   ↓
CI(ci.yml 의 docker job, main push 한정)
   1. 이번 push 커밋(before..sha) 분석
   2. 위 규칙으로 다음 버전 계산 → 세 package.json 갱신
   3. 이미지 빌드 (새 버전이 그대로 baked in)
   4. 버전 커밋을 main 에 push-back  (chore(release): 버전 x.y.z [skip ci])
```

- **화면 버전 자동 동기화**: `apps/web/next.config.mjs` 가 `apps/web/package.json` 의 `version` 을 빌드 타임에 읽어 `NEXT_PUBLIC_APP_VERSION` 으로 주입한다. 설정 페이지(서비스 정보)가 이 값을 표시하므로 **package.json 만 올리면 화면 버전이 자동으로 맞는다.**
- **재배포 루프 없음**: push-back 커밋은 `[skip ci]` 라 CI 가 다시 돌지 않는다.
- **전 과정 non-fatal**: 범프나 push-back 이 실패해도(예: 브랜치 보호) **배포는 계속 진행**된다. 버전은 다음 기회에 반영된다.
- **더블 범프 방지**: 이번 범위에 `package.json` 의 `version` 라인을 이미 바꾼 커밋이 있으면(수동 범프 등) 재범프를 스킵한다. 판정은 커밋 메시지가 아니라 **실제 version 필드 변경** 기준이다.

## 수동 조작 (선택)

로컬 스크립트 `scripts/bump-version.mjs` (= `pnpm bump`). 자동화로 충분하지만 오버라이드가 필요할 때 쓴다.

```bash
pnpm bump          # 커밋 분석 후 자동 판정 → 세 package.json 갱신
pnpm bump --dry    # 계산만 (파일 미수정)
pnpm bump major    # 등급 강제 (마일스톤 등)
pnpm bump patch    # 등급 강제
BASE_REF=<ref> pnpm bump   # 비교 기준 변경 (기본 origin/main)
```

수동으로 버전을 올린 브랜치는, 위 "더블 범프 방지" 덕분에 머지 시 CI 가 다시 올리지 않는다(그 버전 그대로 릴리스).

## 버전이 박히는 위치

세 곳의 `package.json` `version` 을 항상 동일하게 유지한다(스크립트가 일괄 갱신).

- `package.json` (루트)
- `apps/api/package.json`
- `apps/web/package.json` ← 화면 버전의 원본(next.config 가 읽음)
