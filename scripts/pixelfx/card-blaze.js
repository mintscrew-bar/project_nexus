// A pixel fire wall for the bottom of a portrait card (Nexus "픽셀 화염" card).
// Not tongues but one field: tall-stretched noise scrolling upward, minus the height. Where it is hot the color
// steps up a hard ramp, so the top edge comes out jagged with many small peaks, and the noise that scrolls past
// the top breaks off as chunks of dark flame that rise and burn out.
// The ember recipe (via ./_lib.js) is adapted from Sprite Fusion's open-source fire
// (https://www.spritefusion.com/pixel-art-vfx/fire), MIT License, Copyright (c) 2026 Hugo Duprez.
import { fit, mix, clamp, WHITE, tileFbm } from "../../core/index.js";
import { noiseFor, hotFirst, ember, looped } from "./_lib.js";

export const meta = {
  name: "Card blaze",
  desc: "A wall of pixel fire along the bottom of a card: a white-hot base, hard color steps up to dark red jagged peaks, chunks of flame breaking off and rising, embers drifting up.",
  tags: ["fire", "wall", "card", "ambient", "loop"],
  size: [110, 92],
  origin: [55, 92],
  duration: 3,
  loop: true,
  fps: 20,
  bg: "dark",
  options: {
    palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    height: 50,
    seed: 5,
  },
};

const D = meta.duration, NL = noiseFor(D);
const [W, HT] = meta.size, HALF = W / 2;

// heat → color, hottest first. Hard steps: each band is one ramp color, no blending.
// [threshold, index into the hot-first ramp]
const BANDS = [
  [1.07, 1],
  [0.97, 2],
  [0.83, 3],
  [0.66, 4],
  [0.48, 5],
  [0.32, 6],
  [0.18, 7],
];

// noise cells scrolled per loop: a whole number of tile periods, so the loop has no seam
const PY = 6, SPEED = 2;

export function draw(p, t, o) {
  const F = fit(o.palette, 9), H = hotFirst(F), S = o.seed, HF = o.height;
  const phase = t / D;
  const fl = 0.85 + 0.15 * NL(t, 5, S + 1);
  const EMB = [H[1], H[2], H[4], H[6]];

  // the fire's height along the card: a little taller at the sides so it frames the portrait, breathing slowly
  const top = (x) => {
    const side = Math.abs(x) / HALF;
    return HF * (0.9 + 0.22 * side * side) * (0.94 + 0.06 * NL(t, 0.67, S + 9, x * 0.05));
  };

  p.shade(-HALF, -HT + 1, HALF - 1, 0, (x, y, out) => {
    const up = -y; // 0 at the floor
    const h = top(x);
    // tall streaks: stretched in y, scrolling up. A second, finer field roughens the edges.
    const ny = up * 0.06 - phase * PY * SPEED;
    const n1 = tileFbm(x * 0.24 + 30, ny, 0, PY, S, 3);
    const n2 = tileFbm(x * 0.48 + 70, up * 0.128 - phase * PY * 4, 0, PY * 2, S + 50, 2);
    // noise grows with height: a solid base, ragged peaks, chunks breaking off above
    const u = up / h;
    const heat = 1.12 - u + (n1 * 0.7 + n2 * 0.2) * (0.15 + 0.85 * Math.min(1.5, u));
    if (heat < BANDS[BANDS.length - 1][0]) return;
    for (const [th, i] of BANDS) {
      if (heat >= th) {
        // the base glows; the dark tips don't
        if (i <= 3) out.k = 0.12 * (4 - i) * fl;
        return H[i];
      }
    }
  });

  // embers carried up by the heat, wandering and cooling, past the portrait into the dark
  looped(t, D, 18, S + 500, (r) => ({ x: r.range(-HALF + 4, HALF - 4), y: -r.range(20, 38), vx: r.range(-7, 7), vy: -r.range(14, 28), life: r.range(1.2, 2.4), s: r.chance(0.15) ? 2 : 1, a: r.range(0, 6.3), b: r.range(0, 6.3) }), (q, age) => {
    const x = q.x + q.vx * age + 4 * (Math.sin(age * 2.1 + q.a) - Math.sin(q.a));
    const y = q.y + q.vy * age + 2 * (Math.sin(age * 3 + q.b) - Math.sin(q.b));
    if (y < -HT + 1) return;
    ember(p, x, y, 1 - age / q.life, q.s, EMB, age * 40 + q.a);
  });

  // a low warm glow over the whole width
  const GLOW = mix(mix(H[3], H[4], 0.5), WHITE, 0.2);
  for (const x of [-HALF * 0.6, 0, HALF * 0.6]) p.glow(x, -10, 34, GLOW, clamp(0.16 * fl));
}
