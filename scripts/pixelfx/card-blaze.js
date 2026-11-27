// The tongue, lick, flame-puff and ember recipe is adapted from Sprite Fusion's open-source fire
// (https://www.spritefusion.com/pixel-art-vfx/fire), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Rng, fit, mix, clamp, WHITE } from "../../core/index.js";
import { noiseFor, hotFirst, flameTongue, firePuff, lick, ember, looped, LAYERS, BIG_LAYERS, BACK_LAYERS } from "./_lib.js";

export const meta = {
  name: "Card blaze",
  desc: "A wall of fire along the bottom of a portrait card: tall tongues at the sides framing the middle, licks torn off the tips, embers drifting up, a warm glow.",
  tags: ["fire", "wall", "card", "ambient", "loop"],
  size: [88, 74],
  origin: [44, 74],
  duration: 3,
  loop: true,
  fps: 20,
  bg: "dark",
  options: {
    palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"],
    height: 40,
    seed: 5,
  },
};

const D = meta.duration, NL = noiseFor(D);
const HALF = meta.size[0] / 2;

export function draw(p, t, o) {
  const F = fit(o.palette, 9), H = hotFirst(F), S = o.seed, R = new Rng(S), HC = o.height;
  const N = (rate, seed = 0, off = 0) => NL(t, rate, seed, off);
  const fl = 0.74 + 0.16 * N(7.3, S + 1) + 0.1 * N(19, S + 2);
  const GLOW = mix(mix(H[3], H[4], 0.5), WHITE, 0.2);
  const EMB = [H[1], H[2], H[4], H[6]];

  // tongues across the whole width: a back row of dark tall ones, a front row of bright ones. Sides are taller
  // than the middle so the fire frames the portrait instead of hiding it.
  const T = [];
  for (let back = 1; back >= 0; back--) {
    const step = back ? 11 : 8;
    for (let x = -HALF - 2 + (back ? 7 : 0); x <= HALF + 2; x += step) {
      const side = Math.abs(x) / HALF; // 0 middle .. 1 edge
      const env = (0.55 + 0.18 * side * side) * (back ? 1.1 : 0.78);
      T.push({
        dx: x + R.range(-1.2, 1.2),
        y: 1,
        h: 4 + HC * env * R.range(0.7, 1.3),
        w: (back ? 8.5 : 7) * R.range(0.9, 1.1),
        back,
        env,
        n: (S * 7 + T.length) * 13,
      });
    }
  }
  const lean = (tt) => NL(tt, 0.67, S + 90) * 0.1;
  const height = (i, tt) => {
    const { h, n } = T[i], leap = Math.max(0, NL(tt, 2.6, n + 70) - 0.6) * 0.35;
    return (h + 0.22 * h * NL(tt, 3.3, n) + h * leap) * (0.9 + 0.1 * fl);
  };
  const sweep = (i, tt, h) => (NL(tt, 1.6, T[i].n + 40) * (0.6 + h * 0.02) + lean(tt) * h * 0.4) * 0.5;
  const tip = (i, tt) => {
    const h = height(i, tt);
    return [T[i].dx + sweep(i, tt, h) * 0.85, T[i].y - h * 0.88 + 3, h];
  };
  const tongueAt = (i) => {
    const { dx, y, w, n, back } = T[i], h = height(i, t);
    flameTongue(p, dx, y, h, w, sweep(i, t, h), N, n, H, back ? BACK_LAYERS : w > 6 ? BIG_LAYERS : LAYERS, 0.35, 0.4);
  };

  // a bed of fire along the floor so the tongues grow out of something, not out of the card edge
  p.shade(-HALF, -6, HALF, 1, (x, y) => {
    const ripple = 3 + 2 * N(1.5, S + 30, x * 0.15);
    if (-y > ripple) return;
    return -y > ripple - 1.5 ? H[5] : -y > ripple - 3.5 ? H[4] : H[3];
  });

  for (let i = 0; i < T.length; i++) if (T[i].back) tongueAt(i);
  // flame puffs rising off the bed
  const puffs = [];
  looped(t, D, T.length * 10, S + 200, (r, j) => {
    const i = j % T.length;
    return { i, fire: r.range(0.14, 0.3), ox: r.range(-1, 1), oy: r.range(0, 3), vx: r.range(-3, 3), vy: -r.range(14, 26), s: r.range(0.8, 1.5) * (0.8 + 0.5 * T[i].env), f: r.next(), life: 0.3 };
  }, (q, age) => {
    if (age >= q.fire) return;
    const [tx, ty] = tip(q.i, t - age);
    puffs.push([tx + q.ox + q.vx * age, ty + q.oy + q.vy * age, 1 - age / q.fire, q.s, q.f]);
  });
  for (let i = 0; i < T.length; i++) if (!T[i].back) tongueAt(i);
  // licks torn off the tips
  looped(t, D, T.length * 6, S + 220, (r, j) => ({ i: j % T.length, vx: r.range(-3, 3), vy: -r.range(12, 22), s: r.range(0.9, 1.5) * (0.8 + 0.5 * T[j % T.length].env), life: 0.26 }), (q, age) => {
    const [tx, ty] = tip(q.i, t - age);
    lick(p, tx + q.vx * age, ty - 2 + q.vy * age, 1 - age / q.life, q.s, H);
  });
  for (const [x, y, k, s, f] of puffs) firePuff(p, x, y, k, s, f, H);

  // embers carried up by the heat, wandering and cooling; they climb past the portrait into the dark
  looped(t, D, 26, S + 500, (r) => ({ x: r.range(-HALF + 4, HALF - 4), y: -r.range(10, 24), vx: r.range(-8, 8), vy: -r.range(16, 32), life: r.range(1.4, 2.8), s: r.chance(0.15) ? 2 : r.range(1, 1.5), a: r.range(0, 6.3), b: r.range(0, 6.3) }), (q, age) => {
    const x = q.x + q.vx * age + 5 * (Math.sin(age * 2.1 + q.a) - Math.sin(q.a));
    const y = q.y + q.vy * age + 2 * (Math.sin(age * 3 + q.b) - Math.sin(q.b));
    if (y < -meta.size[1] + 1) return;
    ember(p, x, y, 1 - age / q.life, q.s, EMB, age * 40 + q.a);
  });

  // light: a low warm band over the whole width, brighter where the tall side tongues are
  const lx = lean(t) * 10;
  for (const [x, k] of [[-HALF * 0.75, 1], [0, 0.7], [HALF * 0.75, 1]]) {
    p.glow(x + lx, -12, 36, GLOW, clamp(0.24 * k * fl));
  }
  p.glow(lx, -4, 50, H[2], 0.12 * fl);
}
