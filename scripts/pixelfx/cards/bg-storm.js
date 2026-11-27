// Nexus card "천둥번개" backdrop: a storm at sea. The sky and sea under weather/storm's cloud deck (drawn in card-storm), a dark heaving sea to the
// horizon with whitecaps, a black cliff on the right with a lighthouse (its lamp and sweeping beam are animated in
// card-storm), rocks and spray on the left.
import { sky, W } from "./_bg.js";
import { CARD } from "./_card.js";
import { hex, rand, noise } from "../../core/index.js";
export const meta = { name: "Card bg: storm", desc: "Storm at sea: piled clouds, heaving sea, cliff with a lighthouse.", tags: ["card", "bg"], ...CARD, duration: 0.05, loop: true, fps: 20, bg: "dark", options: { seed: 1 } };

export const LIGHTHOUSE = { x: 97, top: 30 };

export function draw(p) {
  sky(p, ["#080c1c", "#0c1228", "#111a36", "#172344", "#1e2c54"], 0, 58, 1, 0.55);
  seaAndCoast(p);
}

export function seaAndCoast(p) {
  // the sea from the horizon down: rows darker toward the viewer, swells and whitecaps
  const HZ = 52;
  p.rect(0, HZ, W, 1, hex("#3a4a7a")); // a pale line where sky meets sea
  p.shade(0, HZ + 1, W - 1, 91, (x, y) => {
    const d = (y - HZ) / 40, swell = noise(x / (6 + d * 10) + y * 0.7, 13);
    if (swell > 0.75 - d * 0.2 && rand(x >> 1, y, 5) > 0.55) return hex("#9aaad8"); // whitecaps
    if (swell > 0.35) return d < 0.3 ? hex("#2a3864") : hex("#1c2648");
    return d < 0.3 ? hex("#18224a") : d < 0.6 ? hex("#121a38") : hex("#0c1228");
  });

  // the cliff on the right, black rock with a cold rim, the lighthouse on top
  const { x: LX, top: LT } = LIGHTHOUSE, cliffTop = 56;
  p.shade(78, 40, W - 1, 91, (x, y) => {
    const t = cliffTop + Math.round(Math.max(0, (86 - x)) * 0.9 + 1.5 * Math.sin(x / 3));
    if (y < t) return;
    if (y === t) return hex("#2c3a66");
    return x < 86 + (y - t) * 0.3 ? hex("#141c36") : hex("#090e1e");
  });
  // the tower: white with red bands, a dark gallery and the lamp room (the lamp itself is lit in card-storm)
  const base = cliffTop, w0 = 6, w1 = 4;
  for (let y = LT + 6; y < base; y++) {
    const u = (y - LT - 6) / (base - LT - 6), half = Math.round((w1 + (w0 - w1) * u) / 2);
    const band = Math.floor((y - LT - 6) / 5) % 2 === 1;
    for (let dx = -half; dx <= half; dx++) p.px(LX + dx, y, dx === half ? hex("#5a6488") : band ? hex("#a83a3a") : hex("#d8dcec"));
    p.px(LX - half - 1, y, hex("#070a14"));
  }
  p.rect(LX - 4, LT + 5, 9, 1, hex("#1a1e2e")); // gallery
  p.rect(LX - 2, LT + 1, 5, 4, hex("#1a1e2e")); // lamp room frame
  p.rect(LX - 1, LT + 2, 3, 2, hex("#3a3020")); // the glass, lit by the sheet
  for (let r = 0; r < 3; r++) p.rect(LX - 2 + r, LT - r, 5 - r * 2, 1, hex("#a83a3a")); // cap
  p.px(LX, LT - 3, hex("#1a1e2e"));

  // rocks on the left breaking the sea, wet tops catching the light
  for (const [x, y, w, h] of [[6, 66, 7, 6], [16, 70, 5, 4], [30, 68, 4, 3]]) {
    p.shade(x - w, y - h, x + w, y + 8, (xx, yy) => {
      const dx = (xx + 0.5 - x) / w, top = y - h * (1 - dx * dx);
      if (yy < top) return;
      return yy < top + 1 ? hex("#3a4a78") : dx < -0.2 ? hex("#1a2244") : hex("#0e1428");
    });
  }
}
