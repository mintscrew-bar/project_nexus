# 버전 관리 정책

프로젝트 버전은 `main`에 병합되면 CI가 자동으로 갱신합니다.

## 버전 규칙

| 변경 종류                       | 증가 단계 |
| ------------------------------- | --------- |
| `BREAKING CHANGE` 또는 `type!:` | major     |
| 사용자 기능 `feat`              | minor     |
| 버그 수정·성능·문서·인프라 변경 | patch     |

`ci`, `deploy`, `build`, `infra`, `deps`, `release`, `chore` 범위의
`feat`는 사용자 기능이 아니므로 patch로 처리합니다.
관리자 화면(`admin`) 범위의 `feat`도 운영진만 보는 기능이라 patch로 처리합니다.

### 커밋 종류 고르기

minor는 **새로운 사용자 기능**에만 씁니다. 이미 있는 기능을 고치거나 다듬는 것은
`feat`가 아니라 `fix`·`style`·`refactor`로 적어 patch가 되게 합니다.

| 변경                                                      | 커밋 종류                    | 증가  |
| --------------------------------------------------------- | ---------------------------- | ----- |
| 새 화면·새 상품 종류·새 시스템 (예: 메달 상점, 묶음 판매) | `feat(...)`                  | minor |
| 있는 기능의 계산 오류·누락 고치기 (예: 일괄 보상 판당 0)  | `fix(...)`                   | patch |
| 있는 화면 다듬기·정보 더 보여 주기·배치 바꾸기            | `style(...)` / `fix(...)`    | patch |
| 관리자 도구 추가·개선                                     | `feat(admin)` / `fix(admin)` | patch |

## 자동 처리 흐름

1. `main` push의 커밋 범위를 분석합니다.
2. `package.json`, `apps/api/package.json`, `apps/web/package.json`을 같은
   버전으로 갱신합니다.
3. 갱신된 버전으로 Docker 이미지를 빌드합니다.
4. `chore(release): 버전 x.y.z [skip ci]` 커밋을 `main`에 반영합니다.

같은 push에 이미 루트 `package.json` 버전 변경이 있으면 이중 범프를
방지하기 위해 자동 갱신을 생략합니다. 자동 범프나 push-back이 실패해도
Docker 배포는 계속 진행됩니다.

설정 화면은 빌드 시 `apps/web/package.json`을 읽어 주입한
`NEXT_PUBLIC_APP_VERSION`을 표시합니다. 따라서 별도 하드코딩 수정은
필요하지 않습니다.

## 수동 사용

```bash
pnpm bump          # 커밋 분석 후 자동 판정
pnpm bump --dry    # 계산만 수행
pnpm bump patch    # patch 강제
pnpm bump minor    # minor 강제
pnpm bump major    # major 강제
BASE_REF=<ref> pnpm bump
```

세 package.json의 현재 버전이 서로 다르면 스크립트는 파일을 수정하지 않고
오류로 종료합니다.
