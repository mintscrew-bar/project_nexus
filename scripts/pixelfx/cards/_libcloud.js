// One still cloud drawn the way pixelfx weather/clouds draws its clouds (that file's banded volumes with a lit crest
// follow Sprite Fusion's open-source fog, https://www.spritefusion.com/pixel-art-vfx/fog, MIT License,
// Copyright (c) 2026 Hugo Duprez): a row of puffs on a flat base and a tier of bigger ones heaped in the middle;
// for each column the top is the highest puff, the belly is nearly flat and lifts at the ends; tone steps down
// from a lit top through the body to a dark belly, Bayer-dithered at the steps; where a lower puff's top shows
// inside the body it is drawn as a lit line, which is what makes the lobes read.
import { hex, rand } from "../../core/index.js";

const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAY[((y & 3) << 2) | (x & 3)];

/**
 * x0: centre, base: belly line, w: width, H: puff height (the cloud stands about 1.6 H tall),
 * ramp: [belly, body, upper, top] colours (dark to light), seed: which cloud.
 */
export function libCloud(p, x0, base, w, H, ramp, seed) {
  const T = ramp.map(hex), R = (k) => rand(seed, 3, k);
  const n = 4 + Math.floor(R(7) * 4), puffs = [];
  for (let k = 0; k < n; k++) {
    const f = (k + 0.5) / n, r = H * (0.5 + 0.35 * Math.sin(Math.PI * f)) * (0.75 + 0.5 * R(10 + k));
    puffs.push([x0 + w * (f - 0.5) + (R(20 + k) - 0.5) * 6, base - r * 0.3 - R(30 + k) * H * 0.15, r]);
  }
  for (let k = 0; k < 1 + Math.floor(R(8) * 3); k++) {
    const f = 0.3 + R(40 + k) * 0.4, r = H * (0.75 + 0.35 * R(50 + k));
    puffs.push([x0 + w * (f - 0.5), base - H * 0.55 - r * 0.2, r]);
  }
  const x1 = x0 - w / 2 - H, x2 = x0 + w / 2 + H;
  for (let x = Math.floor(x1); x <= Math.ceil(x2); x++) {
    const cx = x + 0.5;
    let top = Infinity, top2 = Infinity;
    for (const [px, py, r] of puffs) {
      const dx = cx - px;
      if (dx * dx >= r * r) continue;
      const y = py - Math.sqrt(r * r - dx * dx);
      if (y < top) (top2 = top), (top = y);
      else if (y < top2) top2 = y;
    }
    if (top === Infinity) continue;
    const end = Math.min(cx - x1, x2 - cx) / H, bot = base + 1.5 + Math.sin(cx * 0.21 + seed) * 0.8 - (end < 1 ? (1 - end) * 4 : 0);
    if (bot <= top) continue;
    const h = bot - top, inner = top2 - top > 2.5 && top2 < bot - 2 ? Math.floor(top2) : -999;
    for (let y = Math.floor(top); y < bot; y++) {
      const d = y + 0.5 - top, v = d / h, th = bayer(x, y) * 0.12;
      let c = d < 1 ? 3 : v < 0.25 + th ? 2 : v < 0.62 + th ? 1 : 0;
      if (y === inner) c = Math.max(c, 2);
      p.px(x, y, T[c]);
    }
  }
}
