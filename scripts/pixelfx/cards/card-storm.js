// Nexus card "천둥번개": slanting rain over the whole card, and twice a loop a forked bolt cracks down one side of
// the portrait, flickering, lighting the sky and throwing sparks where it lands. Bolt shape and inking from
// lightning/_lib (adapted from Sprite Fusion's open-source lightning, https://www.spritefusion.com/pixel-art-vfx/lightning,
// MIT License, Copyright (c) 2026 Hugo Duprez).
import { fit, rng, cycle, WHITE, hex } from "../../core/index.js";
import { VOLT, PLASMA, zigzag, stroke, flight, spark } from "../lightning/_lib.js";
import { CARD } from "./_card.js";

export const meta = {
  name: "Card: storm", desc: "Rain slants down the card; twice a loop a forked bolt cracks down one side of the portrait.",
  tags: ["card", "lightning", "storm", "rain", "loop"], ...CARD, duration: 6, loop: true, fps: 20, bg: "dark",
  options: { palette: VOLT, sparks: PLASMA, rain: ["#2b3250", "#46527a", "#6d7cab", "#a5b5e0"], seed: 8 },
};

const [W, H] = CARD.size, FLOOR = 78, D = meta.duration;
// [time, from x, to x]: when each bolt strikes, where it leaves the top and where it lands
// [time, from x, to x, where it lands (y)]: into the sea on the left, into the sea before the cliff on the right
const BOLTS = [[1.1, 12, 22, 64], [4.2, 84, 78, 60]];
// how bright a bolt is on each 20 fps step after it strikes: a hero frame, a dip, a re-strike, then out
const BK = [1, 0.55, 0.15, 0.9, 0.45, 0.6, 0.2];

export function draw(p, t, o) {
  const C = fit(o.palette, 8), RN = fit(o.rain, 4), S = o.sparks.map(hex);
  const steps = BOLTS.map(([bt]) => Math.floor((((t - bt) % D) + D) % D * 20 + 1e-6));
  const flash = BOLTS.reduce((m, _, i) => Math.max(m, BK[steps[i]] ?? 0), 0);

  // rain slanting from above the card to the ground line, lit when the sky flashes
  cycle(t, D, 420, o.seed + 11, (g) => g.range(0.38, 0.5), (age, life, r) => {
    const vy = r.range(190, 230), vx = -vy * 0.2, x0 = r.range(-4, W + 18), y = -6 + vy * age, x = x0 + vx * age;
    if (y > FLOOR + r.range(-8, 4)) return;
    const l = r.range(4, 6.5);
    p.line(x - vx * 0.02 * (l / 4), y - l, x, y, (u) => (u > 0.7 ? (flash > 0.5 ? C[5] : RN[3]) : flash > 0.5 ? C[3] : RN[u > 0.35 ? 2 : 1]));
  });

  // the sky lights up behind everything when a bolt strikes
  if (flash > 0.1) p.glow(W / 2, 8, 90, C[3], 0.28 * flash);

  BOLTS.forEach(([bt, x0, x1, ly], i) => {
    const s = steps[i], k = BK[s];
    if (k !== undefined) {
      stroke(p, zigzag(rng(o.seed, 9, i), x0, -2, x1, ly, 0.24, 0.7), k, C, s === 0 ? 1.15 : 1, { hero: s === 0 });
      p.circle(x1, ly, 2.5 * k + 1, C[5]);
      p.circle(x1, ly, 1.6 * k, WHITE);
      p.glow(x1, ly - 16, 50, C[3], 0.45 * k);
    }
    // sparks thrown where it lands
    const sa = (((t - bt) % D) + D) % D;
    for (let j = 0; j < 12; j++) {
      const q = rng(o.seed, 31 + i, j), life = q.range(0.25, 0.55);
      if (sa >= life) continue;
      const a = -Math.PI / 2 + q.range(-1.3, 1.3), sp = q.range(50, 160);
      const [x, y, vx, vy] = flight(x1, ly, Math.cos(a) * sp, Math.sin(a) * sp, sa, { floor: ly });
      spark(p, x, y, vx, vy, 1 - sa / life, S);
    }
  });

  // the lighthouse lamp and its beam turning round: towards us the beam sweeps out left over the sea, long and
  // bright, then swings away and shrinks behind the tower; the lamp itself pulses with it
  const LX = 97, LY = 32.5, turn = (t / (D / 3)) * Math.PI * 2; // three turns a loop
  const face = Math.cos(turn), lamp = 0.6 + 0.4 * Math.max(0, face);
  p.px(LX - 1, 32, hex("#fff2b0")); p.px(LX, 32, WHITE); p.px(LX + 1, 32, hex("#fff2b0"));
  p.px(LX, 33, hex("#ffd870"));
  p.glow(LX, LY, 10, hex("#ffe8a0"), 0.6 * lamp);
  const len = 70 * Math.max(0, face); // it opens to the left, over the sea
  if (len > 2) {
    p.shade(Math.max(0, LX - len), LY - 10, LX, LY + 10, (x, y, out) => {
      const u = (LX - x) / len; if (u <= 0 || u > 1) return;
      const half = 0.8 + u * 7 * (0.5 + 0.5 * face), d = Math.abs(y + 0.5 - LY - u * 3) / half;
      if (d >= 1) return;
      out.l = hex("#ffe8a0");
      out.k = 0.32 * (1 - d) * (1 - u) * face;
    });
  }
}
