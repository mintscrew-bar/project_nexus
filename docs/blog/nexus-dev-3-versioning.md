# 버전 올리는 걸 잊는 사람을 위한 자동화

안녕하세요. NEXUS를 개발하고 있는 하루마룬입니다.

[지난 글](./nexus-dev-2-reliability.md)에서 서버를 죽지 않게 만드는 작업을 정리했는데요. 그 작업들을 배포하면서 계속 신경 쓰이던 잡일이 하나 있었습니다. 바로 **버전 올리기**입니다.

배포할 때마다 `package.json` 세 곳(루트·api·web)의 버전을 손으로 올리고, 심지어 사이트 설정 페이지에 박아둔 버전 문자열까지 따로 고쳐야 했습니다. 당연히 자주 까먹었고, 어느 날 설정 페이지를 열어보니 **버전이 `1.0.0`으로 몇 달째 멈춰** 있었습니다.

그래서 "사람이 신경 쓰지 않아도 알아서 올라가는" 구조로 아예 바꿨습니다. 이번 글은 그 과정입니다.

---

## 먼저, 규칙부터 정했다

버전 체계는 `MAJOR.MINOR.PATCH`(semver) 형식을 씁니다. 다만 NEXUS는 라이브러리가 아니라 **서비스**라, "API 호환성이 깨지면 major" 같은 semver 본래의 정의가 잘 안 맞습니다. 그래서 각 자리의 의미를 이렇게 다시 정의했습니다.

| 자리 | 올리는 경우 |
|------|-------------|
| **MAJOR** | 대개편·정식 런칭 같은 마일스톤 (수동) |
| **MINOR** | 유저가 체감하는 신규 기능(`feat`) |
| **PATCH** | 버그수정·리팩터 + **인프라성 `feat`** |

핵심은 마지막 줄입니다. 지난 글의 작업들은 커밋 타입이 `feat(ci)`, `feat(deploy)`였지만, **유저가 체감하는 기능은 0**입니다. 그런데 이걸 minor로 올리면 사용자에게 보이는 버전이 인프라 작업 때문에 부풀어 오릅니다.

그래서 **인프라 scope의 `feat`은 patch로 강등**하기로 했습니다.

- `feat(ci): 배포 실패 알림` → **patch** (인프라 scope)
- `feat(clan): 토너먼트 탭` → **minor** (유저 기능)

---

## 규칙을 스크립트로

먼저 이 판정을 코드로 옮겼습니다. 컨벤셔널 커밋 메시지를 파싱해서 다음 버전을 계산하는 작은 스크립트입니다.

```js
// scripts/bump-version.mjs (핵심부)
const INFRA_SCOPES = new Set(["ci", "deploy", "build", "infra", "deps", "release", "chore"]);

function decideBump(subjects, bodies) {
  // BREAKING → major (드묾, 보통 수동)
  if (/BREAKING CHANGE/.test(bodies) || subjects.some((s) => /^\w+(\([^)]*\))?!:/.test(s))) {
    return "major";
  }
  // "유저 체감" feat 이 있으면 minor — 단 인프라 scope 는 제외
  const userFeats = subjects.filter((s) => {
    const m = s.match(/^feat(?:\(([^)]*)\))?!?:/);
    return m && !INFRA_SCOPES.has((m[1] || "").trim());
  });
  return userFeats.length > 0 ? "minor" : "patch";
}
```

세 `package.json`의 `version` 필드만 정확히 치환하도록, 정규식으로 첫 매치만 바꿉니다.

```js
const TARGETS = ["package.json", "apps/api/package.json", "apps/web/package.json"];

for (const rel of TARGETS) {
  const raw = readFileSync(rel, "utf8");
  // 다른 "x.y.z" 오염 방지 — 최상위 version 필드만
  const updated = raw.replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`);
  writeFileSync(rel, updated);
}
```

이제 `pnpm bump`만 치면 `origin/main..HEAD`의 커밋을 분석해 세 `package.json`을 알아서 올립니다. 실제로 이 글을 준비하며 돌려본 결과는 이랬습니다.

```bash
$ pnpm bump --dry        # 커밋 분석 후 계산만 (파일은 안 건드림)
버전 범프: 1.9.0 → 1.10.0  (minor)
판정 근거:
  유저 체감 feat 1건 → minor
    · feat(web): 설정 페이지 버전 자동 동기화
```

자동 판정은 minor로 나왔습니다. 그런데 이번 릴리스는 사실상 '버전 자동화'라는 툴링 작업이 대부분이라, 유저 기능이라 보기엔 애매했습니다. 이렇게 판정을 덮어쓰고 싶을 땐 등급을 직접 지정합니다.

```bash
$ pnpm bump patch        # 등급 강제 → 1.9.1
버전 범프: 1.9.0 → 1.9.1  (patch)
판정 근거:
  등급 강제 지정: patch
```

(`pnpm bump major`도 같은 방식으로, 대개편 같은 마일스톤에 수동으로 씁니다.)

하지만 이것도 여전히 "사람이 명령어를 친다"는 전제가 남아 있습니다. 진짜 목표는 **그것마저 없애는 것**이었습니다. 왜냐면 전 귀차니즘이니까요!

---

## 화면 버전은 빌드가 알아서 (단일 출처)

설정 페이지에 버전을 손으로 박아두는 게 애초에 문제였습니다. 그래서 **`package.json`을 유일한 출처**로 삼고, 빌드 타임에 주입하게 했습니다.

```js
// apps/web/next.config.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { version } = require("./package.json");

const nextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },  // 빌드 시 클라이언트에 인라인
};
```

```tsx
// 설정 페이지 — 하드코딩 대신 주입된 값 사용
<InfoRow label="버전" value={process.env.NEXT_PUBLIC_APP_VERSION ?? "—"} mono />
```

이제 `package.json`만 올리면 화면 버전이 자동으로 따라옵니다. 두 번 고칠 일이 사라졌습니다.

---

## 마지막 한 걸음: 머지하면 CI가 알아서

`pnpm bump`도 안 치고 싶었습니다. 그래서 **main에 머지되면 CI가 스스로 버전을 올리고 커밋까지 되돌려주게** 했습니다.

```yaml
# ci.yml — 이미지 빌드 직전에 버전 범프
- name: 버전 자동 범프
  continue-on-error: true   # 실패해도 배포는 계속 (non-fatal)
  env:
    BASE_REF: ${{ github.event.before }}
  run: |
    node scripts/bump-version.mjs || exit 0
    git diff --quiet && exit 0
    NEW=$(node -e "console.log(require('./package.json').version)")
    git commit -am "chore(release): 버전 ${NEW} [skip ci]"
    git push origin HEAD:main || echo "push-back 실패(비치명)"
```

버전을 올린 뒤에 이미지를 빌드하므로, 새 버전이 그대로 이미지에 baked in 됩니다. push-back 커밋에는 `[skip ci]`를 붙여서 **재배포 무한루프를 막았습니다.**

그리고 전 과정을 `continue-on-error: true`로 두어, 버전 범프가 실패하더라도 (예: 브랜치 보호로 push-back이 막혀도) **배포 자체는 절대 멈추지 않게** 했습니다. 지난 글에서 공들여 세운 배포 경로를 이 편의 기능이 망치면 안 되니까요.

---

## 함정: 더블 범프

여기서 실제로 밟은 함정이 하나 있습니다. 어떤 브랜치에서 버전을 **손으로 이미 올려**뒀는데, 그 브랜치가 머지되면 CI가 그 커밋 범위를 다시 보고 **또 올려버립니다.** 1.9.0이 1.10.0이 되는 식이죠.

처음엔 커밋 메시지로 걸러볼까 했는데, `chore: 버전 정책 문서 수정` 같은 커밋까지 오탐으로 걸렸습니다. 그래서 판정 기준을 메시지가 아니라 **`package.json`의 `version` 라인이 실제로 바뀌었는지**로 바꿨습니다.

```bash
# 이번 범위에 version 필드를 이미 바꾼 커밋이 있으면 재범프 스킵
if [ -n "$(git log -G'"version":' "${BASE_REF}..HEAD" -- package.json)" ]; then
  echo "이미 릴리스됨 → 스킵"
  exit 0
fi
```

`git log -G`는 "해당 패턴이 있는 라인을 추가/삭제한 커밋"을 찾아주기 때문에, 버전을 실제로 바꾼 커밋만 정확히 잡아냅니다. 실제로 확인해보면 이렇게 걸립니다.

```bash
# version 라인을 바꾼 커밋만 (bump 커밋만 잡히고, 스크립트 추가 커밋은 안 잡힘)
$ git log --oneline -G'"version":' origin/main..HEAD -- package.json
fd6a17e chore: 버전 1.9.1로 범프
```

이걸로 자동 범프와 수동 범프가 충돌 없이 공존하게 됐습니다.

---

## 정리하며

지금은 이렇게 굴러갑니다.

```
main 에 머지  →  CI 가:
  1. 커밋 분석 → 다음 버전 계산 (인프라 feat 은 patch)
  2. package.json 갱신  → 이미지에 버전 baked in → 화면에도 자동 반영
  3. 버전 커밋을 main 에 push-back  ([skip ci])
```

제가 할 일은 그냥 **머지**뿐입니다. 버전을 올릴지 말지, 몇으로 올릴지, 어디어디를 고쳐야 하는지 — 이제 아무것도 신경 쓰지 않습니다.

정책 자체는 [`docs/setup/VERSIONING.md`](../setup/VERSIONING.md)에 문서로 남겨서, 나중의 저(혹은 다른 누군가)가 봐도 바로 이해할 수 있게 했습니다.

작은 잡일일수록 자동화의 체감이 큽니다. "까먹어서 버전이 몇 달째 멈춰 있던" 상태로 다시 돌아갈 일은 이제 없습니다.
