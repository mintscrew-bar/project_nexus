// Nexus card "전설의 검": a big sword planted upright in a cracked stone beside the portrait. A faint pillar of blue
// light rises behind it, the cracks in the stone breathe with the same light, a glint runs down the blade once a
// loop and motes drift up round it. (loot-beam's own sword lies flat and small; this one stands.)
import { fit, ease, cycle, WHITE, hex, mix, rand } from "../../core/index.js";
import { glint } from "../pickups/_lib.js";
import { CARD } from "./_card.js";

export const meta = {
  name: "Card: sword", desc: "A legendary sword planted upright in a cracked stone, a pillar of blue light behind it, a glint running down the blade.",
  tags: ["card", "sword", "light", "loop"], ...CARD, duration: 3, loop: true, fps: 20, bg: "dark",
  options: { palette: ["#06122a", "#0c2450", "#123a86", "#1e5ec0", "#3a8af0", "#82c0ff", "#d4ecff", "#ffffff"], seed: 4 },
};

const D = meta.duration;
// where the sword stands: blade axis x, the stone's top, the parts top to bottom
const X = 88, STONE = 72, POMMEL = 28, GUARD = 39, BLADE0 = 42;
const INK = hex("#070a14");
const STEEL = ["#2a3346", "#4b5875", "#8a9ab8", "#c9d6ee", "#f2f7ff"].map(hex);
const GOLD = ["#5a3b12", "#9a6a1e", "#d6a23a", "#ffe08a"].map(hex);
const LEATHER = ["#2a1610", "#4a2a1a", "#6e4228"].map(hex);
const ROCK = ["#141a28", "#222a3c", "#323d55", "#46536f"].map(hex);

export function draw(p, t, o) {
  const C = fit(o.palette, 8), ph = t / D;
  const breath = 0.75 + 0.25 * Math.sin(ph * Math.PI * 2);

  // the pillar of light behind it: soft, additive, widest at the stone, thinning to the sky
  p.shade(X - 9, 0, X + 9, STONE, (x, y, out) => {
    const d = Math.abs(x + 0.5 - X) / (3 + 5 * (y / STONE));
    if (d >= 1) return;
    const pulse = 0.5 + 0.5 * Math.sin((y / 10 + ph * 3) * Math.PI * 2);
    out.l = d < 0.35 ? C[6] : C[5];
    out.k = (0.16 + 0.08 * pulse) * (1 - d) * (0.35 + 0.65 * (y / STONE)) * breath;
  });
  p.glow(X, STONE - 4, 26, C[4], 0.35 * breath);

  // motes drifting up round the sword
  cycle(t, D, 14, o.seed + 3, (g) => g.range(1.2, 2.2), (age, life, r) => {
    const x = X + r.range(-10, 10) + 2 * Math.sin(age * 3 + r.range(0, 6)), y = STONE - 2 - age * r.range(12, 22);
    const k = Math.sin((age / life) * Math.PI);
    if (k > 0.55) p.px(x, y, k > 0.85 ? WHITE : C[6]);
    else if (k > 0.25) p.px(x, y, C[5]);
    p.glow(x, y, 3, C[5], 0.2 * k);
  });

  // the blade: 5 px wide, an ink outline, a lit left bevel, a bright ridge, a dark right bevel, tapering into the stone
  for (let y = BLADE0; y <= STONE + 1; y++) {
    const taper = y > STONE - 4 ? 1 : 2; // narrower where it bites into the stone
    for (let dx = -taper - 1; dx <= taper + 1; dx++) {
      const edge = Math.abs(dx) === taper + 1;
      p.px(X + dx, y, edge ? INK : dx < 0 ? STEEL[dx === -taper ? 3 : 2] : dx === 0 ? STEEL[4] : STEEL[1]);
    }
  }
  // a fuller groove down the middle of the upper blade
  for (let y = BLADE0 + 2; y < BLADE0 + 14; y++) p.px(X, y, STEEL[2]);
  // the guard: a gold bar with curled ends, a blue stone at its heart
  p.rect(X - 8, GUARD - 1, 17, 5, INK);
  p.rect(X - 7, GUARD, 15, 3, GOLD[2]);
  p.rect(X - 7, GUARD, 15, 1, GOLD[3]);
  p.rect(X - 7, GUARD + 2, 15, 1, GOLD[1]);
  for (const s of [-1, 1]) { p.px(X + s * 8, GUARD - 2, INK); p.px(X + s * 7, GUARD - 1, GOLD[1]); }
  p.rect(X - 1, GUARD, 3, 3, C[4]);
  p.px(X, GUARD + 1, C[6]);
  p.px(X - 1, GUARD, WHITE);
  // the grip: leather wraps
  p.rect(X - 2, POMMEL + 3, 5, GUARD - POMMEL - 3, INK);
  for (let y = POMMEL + 4; y < GUARD - 1; y++) for (let dx = -1; dx <= 1; dx++) p.px(X + dx, y, LEATHER[(y + (dx < 0 ? 1 : 0)) % 2 ? 2 : 1]);
  // the pommel: a round blue stone in a gold cup, glowing with the pillar
  p.disc(X + 0.5, POMMEL + 1.5, 3.2, INK);
  p.disc(X + 0.5, POMMEL + 1.5, 2.3, GOLD[1]);
  p.disc(X + 0.5, POMMEL + 1.5, 1.4, C[4]);
  p.px(X - 1, POMMEL, C[7]);
  p.glow(X, POMMEL + 1, 8, C[5], 0.35 * breath);

  // the stone it is buried in: a lumpy rock, lit from the left, cracks glowing blue
  p.shade(X - 13, STONE - 4, X + 13, STONE + 10, (x, y, out) => {
    const dx = (x + 0.5 - X) / 13, top = STONE - 3 + Math.round(3 * dx * dx + rand(Math.floor(x / 3), 11));
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
