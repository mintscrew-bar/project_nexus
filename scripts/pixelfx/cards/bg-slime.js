// Nexus card "통통 슬라임" backdrop: a forest clearing at sunset. A warm sky (purple to pink to gold) so the green
// slimes stand out against it, a low sun on the left, warm-lit clouds, violet mountains, a dark pine line,
// then the clearing: a sunlit grass rim, red spotted mushrooms, flowers, mossy stones, ferns framing the corners.
import { sky, halo, ridge, W } from "./_bg.js";
import { libCloud } from "./_libcloud.js";
import { CARD } from "./_card.js";
import { hex, rand } from "../../core/index.js";
export const meta = { name: "Card bg: slime", desc: "Forest clearing at sunset: warm sky, mountains, pines, mushrooms, ferns.", tags: ["card", "bg"], ...CARD, duration: 0.05, loop: true, fps: 20, bg: "dark", options: { seed: 1 } };

const INK = hex("#0c0a14");

/** a pine: a stepped triangle in one colour, tiers wider at the bottom */
function pine(p, x, base, h, c) {
  for (let r = 0; r < h; r++) {
    const tier = (r % 5) / 5, half = Math.max(0, Math.round((r / h) * h * 0.3 - tier * 1.5));
    p.rect(x - half, base - h + r, half * 2 + 1, 1, c);
  }
  p.rect(x, base - 1, 1, 2, c);
}

/** a red mushroom with white spots on a cream stem, sunlit on the left */
function mushroom(p, x, base, s = 1) {
  const capW = 3 + 2 * s, capH = 2 + s;
  p.rect(x - 1, base - 3 - s, 2 + (s > 1 ? 1 : 0), 3 + s, hex("#efe2c4"));
  p.px(x - 1, base - 3 - s, hex("#fff6e0"));
  for (let r = 0; r < capH; r++) {
    const half = Math.round(capW / 2 - (capH - 1 - r) * 0.8 * (r === 0 ? 1.2 : 0.5));
    p.rect(x - half, base - 3 - s - capH + r, half * 2 + 1, 1, hex(r === 0 ? "#e2504a" : "#b8302e"));
  }
  p.px(x - 1, base - 3 - s - capH + 1, hex("#ffffff"));
  if (s > 1) p.px(x + 1, base - 3 - s - capH + 2, hex("#ffffff"));
  p.px(x - Math.round(capW / 2), base - 3 - s - capH + 1, hex("#ff8a70"));
}

/** a fern / bush clump in the corner: fronds fanning up, lit tips */
function fern(p, x, base, flip, size) {
  const dark = hex("#0e2418"), mid = hex("#1c3c22"), tip = hex("#4a7a30");
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.28 * flip, len = size * (0.7 + 0.3 * rand(i, 77 + x));
    for (let s = 0; s < len; s++) {
      const bend = (s / len) ** 2 * 3 * flip * (i - 3) * 0.3;
      const xx = x + Math.cos(a) * s + bend, yy = base + Math.sin(a) * s;
      p.px(xx, yy, s > len - 2 ? tip : s % 2 ? mid : dark);
      if (s > 2 && s % 2 === 0) { p.px(xx - 1, yy + 1, dark); p.px(xx + 1, yy + 1, dark); }
    }
  }
}

export function draw(p) {
  // the sunset sky: violet at the top through rose and coral to gold at the horizon
  sky(p, ["#24183e", "#3e2150", "#6a2c5c", "#a2465e", "#d86a56", "#f0a05a", "#f8c870"], 0, 62, 0.9, 0.55);
  // the low sun on the left, just above the mountains
  halo(p, 18, 44, 40, "#ffd890", 0.55);
  p.circle(18, 44, 7, hex("#ffd27a"));
  p.circle(18, 44, 6, hex("#ffe6a8"));
  p.circle(17, 43, 4, hex("#fff6dc"));
  // clouds lit by the low sun, drawn the weather/clouds way, in all sizes: [belly, body, upper, top]
  const DUSK = ["#8a3a66", "#c45a74", "#f09080", "#ffd8b0"];
  libCloud(p, 84, 30, 34, 11, DUSK, 5);   // a big heap top right
  libCloud(p, 22, 20, 26, 6, DUSK, 3);    // a long low one top left
  libCloud(p, 48, 34, 10, 3, DUSK, 9);    // scraps
  libCloud(p, 62, 12, 8, 3, DUSK, 13);
  // two birds far off
  for (const [x, y] of [[84, 34], [90, 38]]) { p.px(x - 1, y - 1, INK); p.px(x, y, INK); p.px(x + 1, y - 1, INK); }

  // violet mountains, far then near
  ridge(p, 50, 9, 18, 4, "#5a3a6e");
  ridge(p, 55, 7, 12, 7, "#3e2a58");
  // the pine line along the far edge of the clearing
  const pineC = hex("#1a1e34");
  for (let i = 0; i < 16; i++) {
    const x = Math.round(i * 7.3 + rand(i, 31) * 4), h = 10 + Math.round(rand(i, 32) * 12);
    pine(p, x, 64, h, pineC);
  }
  ridge(p, 64, 1, 8, 9, pineC);

  // the clearing: a sunlit grass rim, grass darkening toward the viewer
  const top = (x) => 68 + Math.round(1.2 * Math.sin(x / 15 + 0.6));
  const G = ["#14281c", "#1c3a22", "#2a5228", "#3e6e2e", "#8ab04a"].map(hex);
  p.shade(0, 62, W - 1, 91, (x, y) => {
    const t0 = top(x);
    if (y < t0) return;
    if (y === t0) return G[4];
    if (y === t0 + 1) return G[3];
    const d = y - t0, r = rand(Math.floor(x / 3), y, 51);
    if (r > 0.88 && d < 8) return G[3];
    return d < 4 ? G[2] : d < 10 ? G[1] : G[0];
  });
  // grass tufts on the rim, lit gold-green
  for (let i = 0; i < 26; i++) {
    const x = Math.round(rand(i, 61) * W), y = top(x), h = 1 + Math.round(rand(i, 62) * 2);
    p.rect(x, y - h, 1, h, G[3]); p.px(x, y - h, G[4]);
  }
  // mossy stones
  for (const [x, w] of [[44, 4], [66, 3]]) {
    const y = top(x);
    p.rect(x - w, y - 2, w * 2 + 1, 3, hex("#4a4a5a")); p.rect(x - w + 1, y - 3, w * 2 - 1, 1, hex("#6a6a7c"));
    p.rect(x - w + 1, y - 3, 2, 1, hex("#5a8a3a"));
  }
  // red mushrooms and flowers in the clearing (kept above the name bar)
  mushroom(p, 40, top(40) + 1, 2);
  mushroom(p, 36, top(36) + 2, 1);
  mushroom(p, 71, top(71) + 1, 1);
  mushroom(p, 104, top(104) + 3, 2);
  for (const [x, c] of [[50, "#fff0a0"], [56, "#ffffff"], [61, "#ffb0d0"], [6, "#fff0a0"], [96, "#ffffff"]]) {
    const y = top(x) + 2;
    p.px(x, y, G[3]); p.px(x, y - 1, hex(c));
  }
  // ferns framing the bottom corners
  fern(p, 3, 92, 1, 16);
  fern(p, 107, 92, -1, 16);
}
