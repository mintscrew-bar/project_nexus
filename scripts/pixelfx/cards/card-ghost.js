// Nexus card "꼬마 유령": a ghost bobs beside the portrait on the right, a fainter one rises out of the graves on
// the left (low, so the lantern above it stays in sight), and will-o'-wisps drift over the graveyard.
import * as ghost from "../critters/ghost.js";
import { CARD, stamp } from "./_card.js";
import { hex, WHITE } from "../../core/index.js";

export const meta = {
  name: "Card: ghost", desc: "A little sheet ghost bobs beside the portrait; a fainter one rises from the graves; wisps drift.",
  tags: ["card", "ghost", "loop"], ...CARD, duration: 4.8, loop: true, fps: 20, bg: "dark", options: { seed: 1 },
};

const D = meta.duration;
const WISP = ["#3f8f86", "#7fe0cc", "#d8fff4"].map(hex);

export function draw(p, t, o) {
  // will-o'-wisps: each wanders a slow loop over the graves, a bright core, a short fading trail, a soft light
  for (const [cx, cy, rx, ry, ph, sp] of [[46, 58, 6, 3, 0.1, 1], [74, 60, 5, 2.5, 0.55, 2], [58, 50, 4, 3, 0.8, 1]]) {
    const at = (dt) => {
      const a = ((t - dt) / D) * Math.PI * 2 * sp + ph * Math.PI * 2;
      return [cx + Math.cos(a) * rx, cy + Math.sin(a * 2) * ry];
    };
    for (let k = 4; k >= 1; k--) { const [x, y] = at(k * 0.07); p.px(x, y, k > 2 ? WISP[0] : WISP[1]); }
    const [x, y] = at(0), flick = 0.7 + 0.3 * Math.sin(t * 11 + ph * 20);
    p.px(x, y, WHITE); p.px(x - 1, y, WISP[2]); p.px(x + 1, y, WISP[2]); p.px(x, y - 1, WISP[2]); p.px(x, y + 1, WISP[1]);
    p.glow(x, y, 9, WISP[1], 0.45 * flick);
  }
  stamp(p, ghost, t, 20, 88, { seed: o.seed + 2, flip: true, fade: 0.7, phase: 1.1, hover: 10 });
  stamp(p, ghost, t, 88, 75, { seed: o.seed, hover: 14 });
}
