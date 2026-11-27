// Nexus avatar decoration "불꽃 고리": the rim of a round avatar burns. Same field as card-blaze — tall noise
// scrolling upward, cut into hard colour steps — but the floor is the circle's edge and the flames are tallest
// over the head, shorter down the sides and only a lick under the chin. The avatar covers the inside.
import { fit, tileFbm, mix, WHITE } from "../../core/index.js";
import { noiseFor, hotFirst, ember, looped } from "../fire/_lib.js";

export const meta = {
  name: "Avatar ring fire", desc: "The rim of a round avatar burns: flames tallest over the head, embers rising.",
  tags: ["avatar", "fire", "ring", "loop"], size: [72, 72], origin: [0, 0], duration: 3, loop: true, fps: 20, bg: "dark",
  options: { palette: ["#4a1712", "#8a1f17", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#ffe26b", "#fff3a6", "#ffffff"], seed: 5 },
};

const D = meta.duration, NL = noiseFor(D), N = 72, C0 = N / 2, R = N / 1.8 / 2;
const BANDS = [[1.07, 1], [0.97, 2], [0.83, 3], [0.66, 4], [0.48, 5], [0.32, 6], [0.18, 7]];
const PY = 6;

export function draw(p, t, o) {
  const H = hotFirst(fit(o.palette, 9)), S = o.seed, ph = t / D;
  const fl = 0.85 + 0.15 * NL(t, 5, S + 1);
  p.shade(0, 0, N - 1, N - 1, (x, y, out) => {
    const dx = x + 0.5 - C0, dy = y + 0.5 - C0, d = Math.hypot(dx, dy);
    if (d < R - 1.5) return;
    const up = d - (R - 1.5);
    // flame height round the ring: tall over the head, short at the sides, a lick under the chin
    const over = -dy / Math.max(1, d);
    const h = 4 + 9 * Math.max(0, over) + 2 * (1 - Math.abs(over));
    const n1 = tileFbm(x * 0.3 + 30, (N - y) * 0.09 - ph * PY * 2, 0, PY, S, 3);
    const n2 = tileFbm(x * 0.6 + 70, (N - y) * 0.18 - ph * PY * 4, 0, PY * 2, S + 50, 2);
    const u = up / h;
    const heat = 1.12 - u + (n1 * 0.7 + n2 * 0.2) * (0.2 + 0.8 * Math.min(1.5, u));
    for (const [th, i] of BANDS) if (heat >= th) { if (i <= 3) out.k = 0.1 * (4 - i) * fl; return H[i]; }
  });
  const EMB = [H[1], H[2], H[4], H[6]];
  looped(t, D, 10, S + 500, (r) => { const a = -Math.PI / 2 + r.range(-1.1, 1.1); return { x: C0 + Math.cos(a) * (R + 4), y: C0 + Math.sin(a) * (R + 4), vx: r.range(-5, 5), vy: -r.range(10, 18), life: r.range(0.8, 1.6), s: 1, a: r.range(0, 6.3) }; }, (q, age) => {
    const y = q.y + q.vy * age; if (y < 1) return;
    ember(p, q.x + q.vx * age + 2 * Math.sin(age * 3 + q.a), y, 1 - age / q.life, q.s, EMB, age * 40 + q.a);
  });
  p.glow(C0, C0 - R * 0.6, R * 1.4, mix(H[3], WHITE, 0.2), 0.12 * fl);
}
