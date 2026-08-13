/**
 * Discord 길드에 등록할 커스텀 이모지 PNG 생성기.
 *
 * 모집 메시지의 게이지·모드 아이콘은 유니코드 문자(▰▱)로 그리면 폰트 폴백에
 * 따라 두부(□)로 깨진다. 커스텀 이모지는 이미지라 어디서든 동일하게 보인다.
 *
 * 사용법:
 *   cd apps/api && npx ts-node --transpile-only scripts/generate-discord-emoji.ts
 *
 * 결과물은 src/modules/discord/assets/emoji/*.png (128x128) 이며
 * DiscordEmojiService 가 길드에 업로드한다. 아이콘 글리프는 lucide (ISC) 기반.
 */
import * as fs from "fs";
import * as path from "path";
// sharp 는 apps/api 의 직접 의존성이 아니라 워크스페이스 루트에 hoist 돼 있다.
const sharp = require("sharp") as typeof import("sharp");

const OUT_DIR = path.resolve(
  __dirname,
  "../src/modules/discord/assets/emoji",
);
const SIZE = 128;

/** 넥서스 액센트 — 웹 앱 tailwind accent-primary 계열과 맞춘다 */
const ACCENT_FROM = "#8B5CF6";
const ACCENT_TO = "#5865F2";
/** 임베드(컨테이너) 배경과 어울리는 비활성 색 */
const OFF_FILL = "#26282D";
const OFF_STROKE = "#4A4D55";

/** lucide 아이콘은 24x24 그리드 기준 stroke 패스라 그대로 스케일해 쓴다 */
const LUCIDE = {
  auction: [
    "m14.5 12.5-8 8a2.119 2.119 0 1 1-3-3l8-8",
    "m16 16 6-6",
    "m8 8 6-6",
    "m9 7 8 8",
    "m21 11-8-8",
  ],
  snake: [
    "M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22",
    "m18 2 4 4-4 4",
    "M2 6h1.9c1.5 0 2.9.9 3.6 2.2",
    "M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8",
    "m18 14 4 4-4 4",
  ],
  balance: [
    "m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z",
    "m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z",
    "M7 21h10",
    "M12 3v18",
    "M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2",
  ],
  manual: [
    "M18 21a8 8 0 0 0-16 0",
    "M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3",
  ],
};
const MANUAL_CIRCLE = { cx: 10, cy: 8, r: 5 };

/** 게이지 눈금 한 칸. 인라인 이모지는 서로 붙지 않아 '칸' 형태가 자연스럽다. */
function pipSvg(on: boolean): string {
  // 이모지는 22px 남짓으로 축소되므로 여백을 넉넉히 주면 형체가 사라진다.
  const inset = 8;
  const box = SIZE - inset * 2;
  const rx = 26;

  if (!on) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
      <rect x="${inset}" y="${inset}" width="${box}" height="${box}" rx="${rx}"
            fill="${OFF_FILL}" stroke="${OFF_STROKE}" stroke-width="8"/>
    </svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${ACCENT_FROM}"/>
        <stop offset="100%" stop-color="${ACCENT_TO}"/>
      </linearGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect x="${inset}" y="${inset}" width="${box}" height="${box}" rx="${rx}"
          fill="url(#g)" filter="url(#glow)"/>
    <rect x="${inset + 10}" y="${inset + 10}" width="${box - 20}" height="${box / 2 - 10}"
          rx="${rx - 10}" fill="#ffffff" opacity="0.18"/>
  </svg>`;
}

/** 모드 아이콘 — 액센트 타일 위에 흰 글리프 */
function modeSvg(kind: keyof typeof LUCIDE): string {
  const paths = LUCIDE[kind]
    .map((d) => `<path d="${d}"/>`)
    .join("");
  const circle =
    kind === "manual"
      ? `<circle cx="${MANUAL_CIRCLE.cx}" cy="${MANUAL_CIRCLE.cy}" r="${MANUAL_CIRCLE.r}"/>`
      : "";

  // 24 그리드를 타일 안쪽 84px 영역에 맞춘다
  const inner = 84;
  const offset = (SIZE - inner) / 2;
  const scale = inner / 24;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
    <defs>
      <linearGradient id="t" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${ACCENT_FROM}"/>
        <stop offset="100%" stop-color="${ACCENT_TO}"/>
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="${SIZE - 8}" height="${SIZE - 8}" rx="30" fill="url(#t)"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})"
       fill="none" stroke="#ffffff" stroke-width="2.4"
       stroke-linecap="round" stroke-linejoin="round">
      ${paths}${circle}
    </g>
  </svg>`;
}

const ASSETS: Array<[string, string]> = [
  ["nx_pip_on", pipSvg(true)],
  ["nx_pip_off", pipSvg(false)],
  ["nx_mode_auction", modeSvg("auction")],
  ["nx_mode_snake", modeSvg("snake")],
  ["nx_mode_balance", modeSvg("balance")],
  ["nx_mode_manual", modeSvg("manual")],
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, svg] of ASSETS) {
    const out = path.join(OUT_DIR, `${name}.png`);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(out);
    const kb = (fs.statSync(out).size / 1024).toFixed(1);
    console.log(`${name}.png  ${kb}KB`);
  }
  console.log(`\n→ ${OUT_DIR}`);
}

void main();
