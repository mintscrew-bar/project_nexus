// Nexus card "전설의 검": a big sword planted upright in a cracked stone on an altar beside the portrait.
// A pillar of blue light rises behind it, a rune ring turns on the floor, crystal shards orbit it, blue-flame
// candles burn on the altar, the cracks in the stone breathe with the light and a glint runs down
// the blade once a loop. (loot-beam's own sword lies flat and small; this one stands.)
import { fit, ease, cycle, WHITE, hex, rand } from "../../core/index.js";
import { glint } from "../pickups/_lib.js";
import { CARD } from "./_card.js";

export const meta = {
  name: "Card: sword", desc: "A legendary sword planted in a cracked stone on an altar: a pillar of light, a turning rune ring, orbiting shards, blue candles.",
  tags: ["card", "sword", "light", "loop"], ...CARD, duration: 4, loop: true, fps: 20, bg: "dark",
  options: { palette: ["#06122a", "#0c2450", "#123a86", "#1e5ec0", "#3a8af0", "#82c0ff", "#d4ecff", "#ffffff"], seed: 4 },
};

const D = meta.duration;
// where the sword stands: blade axis x, the stone's top, the hilt top to bottom
const X = 86, STONE = 68, POMMEL = 18, GUARD = 34, BLADE0 = 38;
const INK = hex("#070a14");
const STEEL = ["#2a3346", "#4b5875", "#8a9ab8", "#c9d6ee", "#f2f7ff"].map(hex);
const GOLD = ["#3d260a", "#7a5216", "#b8862a", "#e8bd52", "#fff0b0"].map(hex);
const LEATHER = ["#1e0f0b", "#3e2216", "#5f3622", "#84513a"].map(hex);
const ROCK = ["#141a28", "#222a3c", "#323d55", "#46536f"].map(hex);
const WAX = ["#3a4258", "#6a7594", "#a3adc8"].map(hex);

/** a small candle: a wax stick h tall with a drip, a blue flame that flickers on its own clock, a little light */
function smallCandle(p, C, t, x, base, h, seed) {
  p.rect(x - 2, base - h - 1, 5, h + 1, INK);
  p.rect(x - 1, base - h, 3, h, WAX[1]);
  p.rect(x - 1, base - h, 1, h, WAX[2]);
  p.px(x + 1, base - h + 1 + (seed % 2), WAX[2]);
  p.rect(x - 3, base, 7, 1, GOLD[1]);
  const f = Math.sin(t * 9 + seed * 2) * 0.5 + Math.sin(t * 23 + seed) * 0.5, tall = 3 + (f > 0.3 ? 1 : 0), lean = f < -0.5 ? -1 : f > 0.7 ? 1 : 0;
  const fy = base - h - 1;
  p.px(x, fy, C[3]);
  for (let k = 1; k <= tall; k++) p.px(x + (k === tall ? lean : 0), fy - k, k === 1 ? WHITE : k === 2 ? C[6] : C[5]);
  if (tall > 3) p.px(x - 1 + (lean > 0 ? 2 : 0), fy - 1, C[5]);
  p.glow(x, fy - 2, 9, C[5], 0.3 + 0.08 * f);
}

/** the hilt: a pommel gem in a gold cup with a spike, a diamond-wrapped grip, winged quillons with a gem at the heart */
function hilt(p, C, breath) {
  // pommel: spike, gold cup, a big round gem
  p.rect(X, POMMEL - 4, 1, 2, INK); p.px(X, POMMEL - 3, GOLD[3]);
  p.disc(X + 0.5, POMMEL + 1.5, 4.4, INK);
  p.disc(X + 0.5, POMMEL + 1.5, 3.5, GOLD[2]);
  p.disc(X + 0.2, POMMEL + 1.2, 3.5, GOLD[3], 0.6);
  p.disc(X + 0.5, POMMEL + 1.5, 2.3, C[3]);
  p.disc(X + 0.2, POMMEL + 1.2, 1.4, C[5]);
  p.px(X - 1, POMMEL, WHITE);
  p.glow(X, POMMEL + 1, 10, C[5], 0.4 * breath);
  // a collar between pommel and grip
  p.rect(X - 2, POMMEL + 5, 5, 2, INK); p.rect(X - 1, POMMEL + 5, 3, 1, GOLD[3]); p.rect(X - 1, POMMEL + 6, 3, 1, GOLD[1]);
  // grip: 5 wide with an ink edge, leather wrapped in diagonal bands, lit on the left
  for (let y = POMMEL + 7; y < GUARD - 1; y++) {
    p.px(X - 2, y, INK); p.px(X + 2, y, INK);
    for (let dx = -1; dx <= 1; dx++) {
      const band = (y + dx) % 3 === 0;
      p.px(X + dx, y, band ? LEATHER[0] : dx < 0 ? LEATHER[3] : dx === 0 ? LEATHER[2] : LEATHER[1]);
    }
  }
  // quillons: a thick gold bar whose wings droop and curl at the tips
  for (let dx = -12; dx <= 12; dx++) {
    const a = Math.abs(dx), droop = Math.round(Math.pow(a / 12, 2.2) * 4), y0 = GUARD - 1 + droop, th = a > 10 ? 2 : 3;
    p.px(X + dx, y0 - 1, INK);
    for (let k = 0; k < th; k++) p.px(X + dx, y0 + k, k === 0 ? (dx < 0 ? GOLD[4] : GOLD[3]) : k === th - 1 ? GOLD[1] : GOLD[2]);
    p.px(X + dx, y0 + th, INK);
  }
  // curled tips
  for (const s of [-1, 1]) { p.px(X + s * 13, GUARD + 2, INK); p.px(X + s * 13, GUARD + 3, GOLD[2]); p.px(X + s * 13, GUARD + 4, INK); p.px(X + s * 12, GUARD + 5, INK); }
  // a lozenge gem at the heart of the guard
  for (let dy = -3; dy <= 3; dy++) {
    const w = 3 - Math.abs(dy);
    for (let dx = -w - 1; dx <= w + 1; dx++) p.px(X + dx, GUARD + 1 + dy, Math.abs(dx) === w + 1 ? INK : dx < 0 && dy < 0 ? C[6] : dy > 0 ? C[3] : C[4]);
  }
  p.px(X - 1, GUARD - 1, WHITE);
  p.glow(X, GUARD + 1, 9, C[5], 0.35 * breath);
}

export function draw(p, t, o) {
  const C = fit(o.palette, 8), ph = t / D;
  const breath = 0.75 + 0.25 * Math.sin(ph * Math.PI * 2);

  // the pillar of light behind it: additive, widest at the stone, thinning to the sky, pulses climbing it
  p.shade(X - 11, 0, X + 11, STONE, (x, y, out) => {
    const d = Math.abs(x + 0.5 - X) / (4 + 6 * (y / STONE));
    if (d >= 1) return;
    const pulse = 0.5 + 0.5 * Math.sin((y / 9 + ph * 4) * Math.PI * 2);
    out.l = d < 0.35 ? C[6] : C[5];
    out.k = (0.2 + 0.1 * pulse) * (1 - d) * (0.3 + 0.7 * (y / STONE)) * breath;
  });
  p.glow(X, STONE - 6, 30, C[4], 0.4 * breath);

  // the rune ring on the altar floor, round the stone: dashes of light that turn, brightest at the front
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2, x = X + Math.cos(a) * 22, y = STONE + 5 + Math.sin(a) * 3.5;
    const on = (i + Math.floor(ph * 64)) % 8 < 5, front = Math.sin(a) > 0;
    if (!on) continue;
    p.px(x, y, front ? C[5] : C[3]);
    if (front) p.glow(x, y, 3, C[5], 0.12 * breath);
  }

  // small candles on the altar and at the foot of the wall, blue flames
  smallCandle(p, C, t, X - 20, STONE + 4, 6, 1);
  smallCandle(p, C, t, X - 15, STONE + 6, 4, 2);
  smallCandle(p, C, t, X + 17, STONE + 5, 5, 3);
  smallCandle(p, C, t, 10, 78, 7, 4);
  smallCandle(p, C, t, 16, 79, 4, 5);

  // crystal shards orbiting the blade on a tilted ring: behind the blade when they're far, in front when near
  const shard = (front) => {
    for (let i = 0; i < 3; i++) {
      const a = ph * Math.PI * 2 + (i * Math.PI * 2) / 3, near = Math.sin(a) > 0;
      if (near !== front) continue;
      const x = X + Math.cos(a) * 15, y = 48 + Math.sin(a) * 4 + 2 * Math.sin(ph * Math.PI * 4 + i);
      const c = near ? C[6] : C[4];
      p.px(x, y - 2, INK); p.px(x - 1, y - 1, INK); p.px(x + 1, y - 1, INK); p.px(x - 1, y, INK); p.px(x + 1, y, INK); p.px(x, y + 2, INK);
      p.px(x, y - 1, c); p.px(x, y, near ? C[5] : C[3]); p.px(x, y + 1, C[3]);
      p.glow(x, y, 5, C[5], near ? 0.3 : 0.12);
    }
  };
  shard(false);

  // motes drifting up round the sword
  cycle(t, D, 18, o.seed + 3, (g) => g.range(1.2, 2.2), (age, life, r) => {
    const x = X + r.range(-12, 12) + 2 * Math.sin(age * 3 + r.range(0, 6)), y = STONE - 2 - age * r.range(12, 22);
    const k = Math.sin((age / life) * Math.PI);
    if (k > 0.55) p.px(x, y, k > 0.85 ? WHITE : C[6]);
    else if (k > 0.25) p.px(x, y, C[5]);
    p.glow(x, y, 3, C[5], 0.2 * k);
  });

  // the blade: 7 px wide with an ink outline, a lit left bevel, a bright ridge, a dark right bevel
  for (let y = BLADE0; y <= STONE + 1; y++) {
    const half = y > STONE - 5 ? 2 : 3;
    for (let dx = -half; dx <= half; dx++) {
      const edge = Math.abs(dx) === half;
      p.px(X + dx, y, edge ? INK : dx < 0 ? STEEL[dx === -half + 1 ? 3 : 2] : dx === 0 ? STEEL[4] : STEEL[dx === 1 ? 1 : 0]);
    }
  }
  // a fuller groove and a blue rune etched into the upper blade
  for (let y = BLADE0 + 2; y < BLADE0 + 16; y++) p.px(X, y, STEEL[2]);
  for (const [dx, dy] of [[0, 5], [-1, 6], [1, 6], [0, 7], [0, 10], [-1, 11], [0, 12]]) p.px(X + dx, BLADE0 + dy, C[5]);
  p.glow(X, BLADE0 + 8, 6, C[5], 0.25 * breath);
  hilt(p, C, breath);
  shard(true);

  // the stone it is buried in: a lumpy rock, lit from the left, a few cracks glowing blue
  p.shade(X - 14, STONE - 4, X + 14, STONE + 10, (x, y, out) => {
    const dx = (x + 0.5 - X) / 14, top = STONE - 3 + Math.round(3 * dx * dx + rand(Math.floor(x / 3), 11));
    if (y < top) return;
    if (y === top) return dx < 0 ? ROCK[3] : ROCK[2];
    const crack = rand(x, y, 5) < 0.012 || (Math.abs(x - X) === 2 && y < STONE + 4) || (Math.abs(x - X - (y - STONE) * 0.8) < 0.6 && y > STONE);
    if (crack) { out.l = C[5]; out.k = 0.4 * breath; return C[4]; }
    return dx < -0.4 ? ROCK[2] : dx < 0.3 ? ROCK[1] : ROCK[0];
  });

  // a glint sliding down the blade once a loop
  const g = (ph - 0.15) / 0.3;
  if (g > 0 && g < 1) {
    const y = BLADE0 + (STONE - BLADE0 - 4) * ease.inOutSine(g);
    glint(p, X - 1, y, 3 * Math.sin(g * Math.PI), WHITE, 0.6);
  }
}
