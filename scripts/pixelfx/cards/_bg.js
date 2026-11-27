// Painted pixel backdrops for the Nexus card scenes: banded skies with dithered seams, silhouettes, moons, stars.
// Every card is 110 x 92, origin top-left. The portrait sits in the middle (about x 34..76, y 12..56) and the
// player's name covers the bottom 18 px, so the interesting parts go at the sides and the top.
import { hex, rand, noise, mix, fbm } from "../../core/index.js";
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

/**
 * A pixel cumulus cloud in the classic style: a silhouette of many small round bumps on a flat base, a 1 px darker
 * outline all round it, a light body lit from the upper left, shadow pooling low and to the right, faint arcs where
 * the bumps overlap, a little dither between light and shadow.
 * cols = { out, shade, mid, hi } (outline, shadow, mid tone, light). w: width; tall: 0..1, how high it heaps up.
 */
export function puffCloud(p, cx, base, w, seed, cols, tall = 0.5) {
  const C = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, hex(v)]));
  const left = cx - w / 2, lobes = [];
  // bumps along the top: big near the middle (toward the left of it), small at the ends
  const n = Math.max(5, Math.round(w / 4));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, mid = Math.max(0, 1 - Math.abs(u - 0.42) * 2.2);
    const r = 1.8 + (w * 0.08 + w * 0.15 * tall) * mid * (0.7 + 0.6 * rand(i, seed)) + rand(i, seed + 2) * 1.6;
    lobes.push({ x: left + u * w + (rand(i, seed + 3) - 0.5) * 2, y: base - r * 0.7 - mid * w * 0.08 * tall, r });
  }
  // a second, lower row of bumps in front, so the body has overlapping lobes
  for (let i = 0; i < Math.max(2, Math.round(n / 2)); i++) {
    const u = (i + 0.7) / (Math.round(n / 2) + 0.4), r = 2 + w * 0.07 * (0.7 + 0.6 * rand(i, seed + 9));
    lobes.push({ x: left + u * w, y: base - r * 0.5, r, front: true });
  }
  const inside = (x, y) => y <= base && (y >= base - 2 && x >= left + 1 && x <= left + w - 2 || lobes.some((L) => Math.hypot(x + 0.5 - L.x, y + 0.5 - L.y) <= L.r));
  // the lobe a pixel belongs to: the front-most (lowest centre) one covering it
  const owner = (x, y) => {
    let best = null;
    for (const L of lobes) if (Math.hypot(x + 0.5 - L.x, y + 0.5 - L.y) <= L.r && (!best || L.y > best.y)) best = L;
    return best;
  };
  const x0 = Math.floor(left - w * 0.2), x1 = Math.ceil(left + w * 1.2), y0 = Math.floor(base - w * 0.7), y1 = base + 1;
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) {
        // the outline: any empty pixel touching the cloud
        if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) p.px(x, y, C.out);
        continue;
      }
      const L = owner(x, y);
      if (y >= base) { p.px(x, y, C.shade); continue; } // the flat underside
      if (!L) { p.px(x, y, y >= base - 1 ? C.shade : C.mid); continue; }
      const nx = (x + 0.5 - L.x) / L.r, ny = (y + 0.5 - L.y) / L.r, d = Math.hypot(nx, ny);
      // an arc where this lobe's rim sits over a lobe behind it
      // only bigger bumps show their overlap arc, and only a thin one, so big clouds don't turn into scales
      const overlap = L.r > 4 && d > 1 - 1.2 / L.r && ny < 0.1 && lobes.some((M) => M !== L && Math.hypot(x + 0.5 - M.x, y + 0.5 - M.y) <= M.r - 0.5);
      const light = -nx * 0.55 - ny * 0.85; // lit from the upper left
      const low = (y - (base - 3)) / 3;      // shadow pools along the base
      const v = light - Math.max(0, low) * 0.9 + (BAY[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 0.35;
      p.px(x, y, overlap ? C.mid : v > 0.15 ? C.hi : v > -0.35 ? C.mid : C.shade);
    }
  }
}

/**
 * A soft pixel cloud with no outline, the painterly kind: a heap whose top edge wanders with noise (ragged, stair-
 * stepped), a flat base, and tone that climbs from a shaded underside to bright tops in hard steps, broken up by
 * the cloud's own billows so it doesn't read as a smooth gradient. w wide, h tall at its highest, base at y.
 * ramp: shadow .. light (4-6 colours). flat (0..1): 0 a round heap, 1 a long low wisp.
 */
export function softCloud(p, cx, base, w, h, seed, ramp, flat = 0) {
  const K = ramp.map(hex), n = K.length;
  const x0 = Math.floor(cx - w / 2 - 2), x1 = Math.ceil(cx + w / 2 + 2), y0 = Math.floor(base - h - 4);
  for (let y = y0; y <= base; y++) {
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - cx) / (w / 2);
      if (Math.abs(u) > 1.15) continue;
      // the heap's profile: a dome (or a long low wisp), its edge pushed about by two octaves of noise
      const v = (base - y + 0.5) / h; // 0 at the base .. 1 at the top
      const prof = Math.pow(Math.max(0, 1 - u * u), 0.6 + flat * 0.8);
      const ragged = 0.28 * fbm(x * 0.11, y * 0.11, seed, 3) + 0.12 * fbm(x * 0.3, y * 0.3, seed + 7, 2);
      // less raggedness high up, so the crown is lumpy rather than spiky
      if (v - ragged * (1 - 0.45 * Math.min(1, v)) > prof) continue;
      if (v < 0 || (v < 0.12 && Math.abs(u) > 0.95 - ragged)) continue; // the base tucks in at the ends
      // tone: brighter toward the top, billows lit on their upper side, a shaded band along the base
      const billow = fbm(x * 0.09 + 3, y * 0.13, seed + 11, 3);
      let tone = 0.15 + 0.9 * v + 0.75 * billow - 0.25 * Math.max(0, u);
      if (y >= base - 1) tone -= 0.5;
      p.px(x, y, K[Math.max(0, Math.min(n - 1, Math.floor(tone * n)))]);
    }
  }
}

export { mix, hex };
