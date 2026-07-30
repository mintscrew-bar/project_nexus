#!/usr/bin/env bash
# 배너 폰트(메모먼트 꾹꾹체) 서브셋 재생성 스크립트
#
# 왜 필요한가:
#   원본 폰트는 한글 11,172자를 담아 2.46MB다. 실제로 쓰이는 곳은
#   apps/web/src/components/home/CreatorBanner.tsx의 고정 문구 한 줄뿐이라
#   그 문구에 필요한 글자만 남겨 36KB로 줄여 자체 호스팅한다.
#
# 언제 실행하는가:
#   CreatorBanner의 배너 문구를 바꿨을 때. 서브셋에 없는 글자는 에러 없이
#   조용히 폴백 폰트로 렌더되어 글씨체가 섞여 보이므로 반드시 재생성한다.
#
# 사용법:
#   BANNER_TEXT="새 배너 문구" ./scripts/subset-banner-font.sh
#
# 선행 조건: python3, 그리고 fonttools + brotli (없으면 임시 venv에 자동 설치)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$REPO_ROOT/apps/web/public/fonts/memoment-kkukkkuk-subset.woff2"
SRC_URL="https://cdn.jsdelivr.net/gh/woffz/b3@main/memomentKkukKkuk/memomentKkukKkuk.woff2"

# CreatorBanner.tsx의 문구와 일치해야 한다.
BANNER_TEXT="${BANNER_TEXT:-NEXUS와 함께 성장할 스트리머, 클랜을 찾고 있어요}"
# 문구 외에 기본 라틴/숫자/문장부호를 함께 넣어 소소한 문구 변경을 견디게 한다.
EXTRA=' !?.,:;()-–—…·/&%+0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "▸ 원본 폰트 내려받는 중..."
curl -sSfL "$SRC_URL" -o "$WORK/original.woff2"

if ! python3 -c "import fontTools, brotli" 2>/dev/null; then
  echo "▸ fonttools 설치 중 (임시 venv)..."
  python3 -m venv "$WORK/venv"
  "$WORK/venv/bin/pip" install --quiet fonttools brotli
  PYFTSUBSET="$WORK/venv/bin/pyftsubset"
else
  PYFTSUBSET="$(command -v pyftsubset)"
fi

echo "▸ 서브셋 생성 중..."
"$PYFTSUBSET" "$WORK/original.woff2" \
  --text="${BANNER_TEXT}${EXTRA}" \
  --flavor=woff2 \
  --layout-features='*' \
  --output-file="$OUT"

BEFORE=$(stat -c%s "$WORK/original.woff2")
AFTER=$(stat -c%s "$OUT")
echo "✓ $OUT"
printf '  %s bytes → %s bytes (%.1f%% 감소)\n' "$BEFORE" "$AFTER" \
  "$(awk -v b="$BEFORE" -v a="$AFTER" 'BEGIN{print (b-a)/b*100}')"
