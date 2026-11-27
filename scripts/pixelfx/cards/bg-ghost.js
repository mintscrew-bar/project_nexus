// Nexus card "꼬마 유령" backdrop: a moonlit graveyard. A crescent moon top right, a small chapel on the far hill
// below the portrait, a gnarled tree on the left with a lantern hanging off a branch, an iron fence along
// the crest, big crooked headstones and crosses raised on the hill (above the name bar), mist in the hollow.
import { sky, halo, ridge, stars, moon, fogBand, W } from "./_bg.js";
import { CARD } from "./_card.js";
import { hex, rand } from "../../core/index.js";
export const meta = { name: "Card bg: ghost", desc: "Moonlit graveyard: chapel, gnarled tree with lantern, fence, headstones, mist.", tags: ["card", "bg"], ...CARD, duration: 0.05, loop: true, fps: 20, bg: "dark", options: { seed: 1 } };

const INK = hex("#060914");
const SIL = ["#0b1124", "#111a33", "#18233f"].map(hex); // silhouettes, far to near
const STONE = ["#1c2540", "#2c3858", "#43527a", "#6a7aa6"].map(hex); // headstones: shadow .. moonlit edge
const GRASS = ["#0d1a26", "#16293a", "#22405a"].map(hex);

function chapel(p, x, base) {
  // small and far: a nave, a steeple with a cross, one pointed window glowing faintly
  const c = SIL[0];
  p.rect(x, base - 7, 10, 7, c);
  for (let r = 0; r < 4; r++) p.rect(x - 1 + r, base - 8 - r, 12 - r * 2, 1, c);
  p.rect(x + 1, base - 16, 4, 9, c);
  for (let r = 0; r < 4; r++) p.rect(x + 1 + Math.floor(r / 2), base - 17 - r, 4 - Math.floor(r / 2) * 2, 1, c);
  p.rect(x + 2, base - 24, 2, 4, c); p.rect(x + 1, base - 23, 4, 1, c);
  const glow = hex("#9fd8c8");
  p.rect(x + 2, base - 13, 2, 2, glow);
  p.rect(x + 7, base - 5, 1, 2, hex("#6fa89a"));
  halo(p, x + 3, base - 12, 5, "#9fd8c8", 0.3);
}

/** a gnarled tree on the left: thick strokes along fixed bends, a lantern hanging from the long low limb */
function tree(p) {
  const c = hex("#070b18");
  // [from x, from y, to x, to y, width from, width to]
  const stroke = (x0, y0, x1, y1, w0, w1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= n; i++) {
      const u = i / n, w = w0 + (w1 - w0) * u;
      p.disc(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, Math.max(0.5, w / 2), c);
    }
  };
  // trunk, leaning and kinked, with roots
  stroke(8, 70, 11, 54, 6, 5); stroke(11, 54, 9, 42, 5, 4); stroke(9, 42, 12, 30, 4, 3);
  stroke(2, 70, 8, 66, 2, 3); stroke(15, 70, 10, 65, 2, 3);
  // the long low limb reaching right, where the lantern hangs
  stroke(10, 46, 18, 40, 3, 2); stroke(18, 40, 27, 39, 2, 1.2); stroke(27, 39, 31, 36, 1.2, 1);
  // upper limbs and twigs
  stroke(12, 30, 20, 18, 3, 1.5); stroke(20, 18, 26, 14, 1.5, 1); stroke(20, 18, 21, 10, 1.2, 1);
  stroke(11, 33, 3, 22, 2.5, 1.2); stroke(3, 22, 1, 15, 1.2, 1); stroke(6, 26, 9, 19, 1, 1);
  stroke(15, 25, 13, 16, 1.2, 1); stroke(24, 39, 25, 43, 1, 1);
  // the lantern: a chain from the limb, a little iron cage with a pale flame
  const hx = 26, hy = 39;
  for (let k = 1; k <= 4; k++) p.px(hx, hy + k, INK);
  p.rect(hx - 2, hy + 5, 5, 1, INK);
  p.rect(hx - 2, hy + 6, 5, 5, INK);
  p.rect(hx - 1, hy + 6, 3, 4, hex("#bfeee0"));
  p.px(hx, hy + 7, hex("#ffffff"));
  p.rect(hx - 1, hy + 11, 3, 1, INK);
  halo(p, hx, hy + 8, 16, "#9fe8d0", 0.45);
}

function fence(p, x0, x1, base, gate = null) {
  const bar = hex("#26304e"), tip = hex("#5a6a96");
  const open = (x) => gate && x > gate[0] && x < gate[1];
  for (let x = x0; x < x1; x++) if (!open(x)) { p.px(x, base - 6, bar); p.px(x, base - 2, bar); }
  for (let x = x0; x < x1; x += 3) {
    if (open(x)) continue;
    p.rect(x, base - 8, 1, 8, bar);
    p.px(x, base - 9, tip); p.px(x - 1, base - 8, bar); p.px(x + 1, base - 8, bar); // spear tip, moonlit
  }
  if (gate) for (const gx of gate) {
    // stone gate posts with a ball on top, moonlit on the right
    p.rect(gx - 1, base - 11, 3, 11, STONE[1]); p.px(gx + 1, base - 11, STONE[3]); p.rect(gx + 1, base - 10, 1, 10, STONE[2]);
    p.disc(gx + 0.5, base - 12.5, 1.6, STONE[2]); p.px(gx + 1, base - 13, STONE[3]);
  }
}

/** a headstone with a moonlit right edge (the moon is on the right) and a darker base */
function stone(p, x, base, w, h, kind, lean = 0) {
  const r = w / 2;
  p.shade(x - r - 1, base - h - 1, x + r + 1, base, (xx, yy) => {
    const dx = xx + 0.5 - x - lean * (base - yy) / h, top = base - h + r;
    if (kind === "cross") {
      const arm = yy >= base - h + 2 && yy <= base - h + 3;
      if (!(Math.abs(dx) <= 1 || (arm && Math.abs(dx) <= r))) return;
      if (yy < base - h) return;
      return dx >= 0.5 ? STONE[3] : STONE[1];
    }
    const inside = yy >= top ? Math.abs(dx) <= r : Math.hypot(dx, yy + 0.5 - top) <= r;
    const out = yy >= top ? Math.abs(dx) <= r + 1 : Math.hypot(dx, yy + 0.5 - top) <= r + 1;
    if (!out) return;
    if (!inside) return INK;
    if (dx > r - 1.2) return STONE[3];
    if (yy > base - 2) return STONE[0];
    return kind === "carved" && Math.abs(dx) < r - 1.5 && (yy === top + 1 || yy === top + 3) ? STONE[0] : STONE[2];
  });
}

export function draw(p) {
  sky(p, ["#090e20", "#0f1731", "#152142", "#1d2c55", "#283a68"], 0, 78, 1.1, 0.55);
  stars(p, 34, 5, 46, ["#4a5a8c", "#9fb0e0", "#ffffff"]);
  // the moon top right, in the clear sky over the ghost there
  halo(p, 92, 14, 28, "#c8d8ff", 0.45);
  moon(p, 92, 14, 8, { lit: "#eef2ff", mid: "#c9d3f0", dark: "#9aa6cc", crescent: -1, skyC: "#0f1731" });

  // ── depth, back to front: far hill with chapel and tiny far stones, fence on the middle rise with mid stones,
  // mist between, then the near slope with big moonlit stones; dark grass frames the bottom corners
  ridge(p, 58, 5, 30, 2, SIL[0]);
  chapel(p, 36, 59);
  const far = hex("#141c34");
  for (const [x, h, cross] of [[50, 4, 1], [55, 3, 0], [61, 4, 1], [72, 3, 0], [77, 4, 1]]) {
    const base = 58 - Math.round(2 * Math.sin(x / 11));
    if (cross) { p.rect(x, base - h, 1, h, far); p.rect(x - 1, base - h + 1, 3, 1, far); } else p.rect(x - 1, base - h, 3, h, far);
  }
  // the gnarled tree on the left, the lantern on its low limb
  tree(p);
  // the middle rise: a rolling crest with a moonlit rim, the fence along it, two smaller, dimmer stones
  const mid = (x) => 63 + Math.round(1.5 * Math.sin(x / 13 + 1));
  p.shade(0, 58, W - 1, 91, (x, y) => (y < mid(x) ? undefined : y === mid(x) ? hex("#26365c") : SIL[1]));
  fence(p, 30, 84, 63);
  stone(p, 47, 66, 5, 7, "round");
  stone(p, 63, 65, 5, 8, "cross");
  fogBand(p, 66, 4, "#8aa0d8", 0.35, 9);
  // the near slope: lower, closer, a little lighter, with the big stones on it
  const near = (x) => 68 + Math.round(2 * Math.sin(x / 17 + 2.2));
  const SOIL = ["#0d1426", "#141d34", "#1c2844"].map(hex);
  p.shade(0, 64, W - 1, 91, (x, y) => {
    const t0 = near(x);
    if (y < t0) return;
    if (y === t0) return hex("#33477a");
    if (y === t0 + 1) return SOIL[2];
    return rand(Math.floor(x / 6), y, 41) > 0.85 && y < t0 + 8 ? SOIL[2] : y > t0 + 10 ? SOIL[0] : SOIL[1];
  });
  stone(p, 25, 72, 9, 13, "carved", -0.6);
  stone(p, 40, 71, 7, 11, "cross", 0.3);
  stone(p, 71, 71, 8, 11, "round", 0.8);
  stone(p, 84, 73, 9, 13, "carved");
  // grass clumps along the near slope, moonlit tips; a few pale flowers by the stones
  for (let i = 0; i < 22; i++) {
    const x = Math.round(rand(i, 51) * W), y = near(x) + 1 + Math.round(rand(i, 52) * 5), h = 2 + Math.round(rand(i, 53) * 2);
    p.rect(x - 1, y - h + 1, 1, h - 1, GRASS[1]); p.rect(x, y - h, 1, h, GRASS[2]); p.rect(x + 1, y - h + 1, 1, h - 1, GRASS[2]);
    p.px(x + 1, y - h + 1, hex("#4a6c8c"));
  }
  for (const [x, y] of [[19, 73], [32, 72], [46, 72], [66, 73], [78, 72], [92, 74]]) {
    p.px(x, y, GRASS[2]); p.px(x, y - 1, hex("#b8d0ff")); p.px(x - 1, y - 1, hex("#7e9ad8")); p.px(x + 1, y - 1, hex("#7e9ad8"));
  }
  // dark tall grass framing both bottom corners (nearest of all)
  const fg = hex("#060a16");
  for (let x = 0; x < W; x++) {
    const edge = Math.max(0, 1 - Math.min(x, W - 1 - x) / 22);
    if (edge <= 0) continue;
    // separate blades: every column its own height, every few a tall one, a faint lit tip on the tall ones
    const r = rand(x, 61), h = Math.round(edge * (4 + 14 * r * r) + (r > 0.8 ? 5 * edge : 0));
    p.rect(x, 92 - 12 - h, 1, h + 12, fg);
    if (r > 0.7 && h > 6) p.px(x, 92 - 12 - h, hex("#1a2744"));
  }
  fogBand(p, 76, 5, "#8aa0d8", 0.25, 4);
}
