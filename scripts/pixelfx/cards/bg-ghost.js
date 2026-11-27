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

function fence(p, x0, x1, base) {
  const bar = hex("#0a1020");
  p.rect(x0, base - 6, x1 - x0, 1, bar);
  p.rect(x0, base - 2, x1 - x0, 1, bar);
  for (let x = x0; x < x1; x += 3) {
    p.rect(x, base - 8, 1, 8, bar);
    p.px(x, base - 9, bar); p.px(x - 1, base - 8, bar); p.px(x + 1, base - 8, bar); // spear tip
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
  sky(p, ["#090e20", "#0f1731", "#152142", "#1d2c55", "#283a68"], 0, 78, 1.1);
  stars(p, 34, 5, 46, ["#4a5a8c", "#9fb0e0", "#ffffff"]);
  // the moon top right, in the clear sky over the ghost there
  halo(p, 92, 14, 28, "#c8d8ff", 0.45);
  moon(p, 92, 14, 8, { lit: "#eef2ff", mid: "#c9d3f0", dark: "#9aa6cc", crescent: -1, skyC: "#0f1731" });

  // the far hill, a small chapel on it below the portrait
  ridge(p, 60, 5, 30, 2, SIL[0]);
  chapel(p, 36, 60);
  // the gnarled tree on the left: the faint ghost there is see-through, the crown and lantern rise above it
  tree(p);
  // the graveyard hill: raised so the stones stand clear of the name bar
  ridge(p, 65, 4, 26, 9, SIL[1], { rim: "#2a3a62" });
  fence(p, 30, 82, 63);
  stone(p, 25, 69, 9, 12, "carved", -0.6);
  stone(p, 44, 68, 7, 11, "cross");
  stone(p, 68, 68, 8, 10, "round", 0.8);
  stone(p, 80, 70, 9, 12, "carved");
  // grass tufts along the hill
  for (let x = 0; x < W; x += 2) {
    const h = Math.round(1 + rand(x, 21) * 3), y = 67 + Math.round(2 * Math.sin(x / 9));
    p.rect(x, y - h, 1, h, GRASS[rand(x, 22) > 0.5 ? 2 : 1]);
  }
  p.rect(0, 71, W, 21, GRASS[0]);
  fogBand(p, 71, 7, "#8aa0d8", 0.5, 4);
  fogBand(p, 60, 4, "#7d8fc0", 0.25, 9);
}
