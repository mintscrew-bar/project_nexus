// Painted pixel backdrops for the Nexus card scenes: banded skies with dithered seams, silhouettes, moons, stars.
// Every card is 110 x 92, origin top-left. The portrait sits in the middle (about x 34..76, y 12..56) and the
// player's name covers the bottom 18 px, so the interesting parts go at the sides and the top.
import { hex, rand, noise, mix } from "../../core/index.js";
import { CARD } from "./_card.js";

export const [W, H] = CARD.size;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const dither = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

/** Vertical sky from y0 to y1 through the ramp (top first): hard bands, a 4x4 ordered dither where they meet. */
export function sky(p, ramp, y0 = 0, y1 = H, curve = 1, seam = 0.35) {
  const C = ramp.map(hex), n = C.length - 1;
  p.shade(0, y0, W - 1, y1 - 1, (x, y) => {
    const v = Math.pow((y - y0) / Math.max(1, y1 - y0), curve) * n, i = Math.floor(v), f = v - i;
    // only the last `seam` of each band dithers into the next: wide flat bands, short seams (1 = an even ramp)
    const g = (f - (1 - seam)) / seam;
    return C[Math.min(n, g > dither(x, y) ? i + 1 : i)];
  });
}

/** A soft halo: additive light (smooth, no dither dots), for moons and glows. */
export function halo(p, cx, cy, r, c, k = 0.5) {
  p.glow(cx, cy, r, hex(c), k);
}

/** Stars: n single pixels above maxY, a few brighter crosses. */
export function stars(p, n, seed, maxY, cols = ["#6c7aa8", "#a8b8e0", "#ffffff"]) {
  const C = cols.map(hex);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rand(i, seed) * W), y = Math.floor(rand(i, seed + 1) * maxY), b = rand(i, seed + 2);
    p.px(x, y, C[b > 0.85 ? 2 : b > 0.45 ? 1 : 0]);
    if (b > 0.96) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) p.px(x + dx, y + dy, C[0]);
  }
}

/** A ridge of silhouette: its top wanders round baseY by amp (noise of the given wavelength), filled to the bottom. */
export function ridge(p, baseY, amp, wave, seed, c, { jag = 0, rim } = {}) {
  const col = hex(c), rimC = rim ? hex(rim) : 0;
  for (let x = 0; x < W; x++) {
    const top = Math.round(baseY - amp * (0.5 + 0.5 * noise(x / wave, seed)) - (jag ? jag * rand(x, seed + 5) : 0));
    for (let y = top; y < H; y++) p.px(x, y, rimC && y === top ? rimC : col);
  }
}

/** Moon of radius r: a lit disc, a darker limb on the lower right, a couple of craters; crescent cuts it. */
export function moon(p, cx, cy, r, { lit = "#f6e7b8", mid = "#e2c98a", dark = "#b99a5e", crescent = 0, skyC } = {}) {
  const L = hex(lit), M = hex(mid), D = hex(dark), S = skyC ? hex(skyC) : 0;
  p.shade(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, (x, y) => {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
    if (d > r) return;
    if (crescent && Math.hypot(dx - crescent * r * 0.55, dy - crescent * r * 0.25) < r * 0.92) return S || undefined;
    // lit from the upper left: a soft shadowed limb on the lower right, a darker rim at the very edge
    const lit = Math.hypot(dx + r * 0.35, dy + r * 0.35) / r;
    if (d > r - 1 && lit > 1) return D;
    return lit > 1.05 ? M : L;
  });
  if (!crescent) {
    // faint maria: soft patches in the mid tone, off-centre so they never read as a face
    for (const [ox, oy, rr] of [[0.2, -0.15, 0.22], [-0.3, 0.3, 0.16], [0.35, 0.4, 0.1]]) p.circle(cx + ox * r, cy + oy * r, rr * r, M);
  }
}

/** A bare dead tree: a leaning trunk and a few forking branches, in one colour. */
export function deadTree(p, x, baseY, h, c, seed = 1, flip = 1) {
  const col = hex(c);
  const branch = (x0, y0, a, len, w, depth) => {
    const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    for (let s = 0; s <= len; s += 0.5) {
      const u = s / len, xx = x0 + (x1 - x0) * u, yy = y0 + (y1 - y0) * u, ww = Math.max(0, w * (1 - u * 0.6));
      for (let k = -Math.floor(ww / 2); k <= Math.floor(ww / 2); k++) p.px(xx + k, yy, col);
    }
    if (depth <= 0) return;
    const n = 2;
    for (let i = 0; i < n; i++) {
      const r = rand(depth * 7 + i, seed + Math.round(x0));
      branch(x1, y1, a + (i ? 0.5 : -0.6) * flip + (r - 0.5) * 0.4, len * (0.55 + r * 0.2), w * 0.6, depth - 1);
    }
  };
  branch(x, baseY, -Math.PI / 2 + 0.12 * flip, h * 0.45, 3, 3);
}

/** A tombstone: rounded top or cross, lit edge on the left. */
export function tomb(p, x, baseY, w, h, c, lit, cross = false) {
  const C = hex(c), L = hex(lit);
  if (cross) {
    p.rect(x - 1, baseY - h, 2, h, C);
    p.rect(x - Math.round(w / 2), baseY - h + 2, w, 2, C);
    p.px(x - 1, baseY - h, L);
    return;
  }
  const r = w / 2;
  p.shade(x - r, baseY - h, x + r, baseY, (xx, yy) => {
    const dx = xx + 0.5 - x, top = baseY - h + r;
    if (yy < top && Math.hypot(dx, yy + 0.5 - top) > r) return;
    return dx < -r + 1.2 ? L : C;
  });
}

/** Castle silhouette: towers [x, width, height, roof?] standing on baseY, with crenellations and pointed roofs. */
export function castle(p, baseY, towers, c, windowC) {
  const col = hex(c), win = windowC ? hex(windowC) : 0;
  for (const [x, w, h, roof] of towers) {
    p.rect(x, baseY - h, w, h + 1, col);
    if (roof) {
      // a pointed roof: rows narrowing to a spike
      for (let r = 0; r < roof; r++) {
        const half = (w / 2 + 1) * (1 - r / roof);
        p.rect(Math.round(x + w / 2 - half), baseY - h - 1 - r, Math.max(1, Math.round(half * 2)), 1, col);
      }
    } else {
      for (let i = 0; i < w; i += 2) p.px(x + i, baseY - h - 1, col);
    }
    if (win) p.rect(x + Math.floor(w / 2), baseY - Math.round(h * 0.6), 1, 2, win);
  }
}

/** A band of ground fog: additive light, thickest at y, thinning above and below, lumpy along x. */
export function fogBand(p, y, thick, c, k = 0.6, seed = 3) {
  const col = hex(c);
  p.shade(0, y - thick, W - 1, y + thick, (x, yy, o) => {
    const d = Math.abs(yy - y) / thick, n = 0.6 + 0.4 * noise(x / 9, seed);
    const kk = k * (1 - d) * n;
    if (kk <= 0) return;
    o.l = col;
    o.k = kk * 0.5;
  });
}

export { mix, hex };
