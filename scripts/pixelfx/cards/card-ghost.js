// Nexus card "꼬마 유령": a ghost bobs beside the portrait, a fainter one drifts on the far side.
import * as ghost from "../critters/ghost.js";
import { CARD, stamp } from "./_card.js";

export const meta = {
  name: "Card: ghost", desc: "A little sheet ghost bobs beside the portrait; a fainter one hovers on the other side.",
  tags: ["card", "ghost", "loop"], ...CARD, duration: 4.8, loop: true, fps: 20, bg: "dark", options: { seed: 1 },
};

export function draw(p, t, o) {
  stamp(p, ghost, t, 22, 72, { seed: o.seed + 2, flip: true, fade: 0.7, phase: 1.1, hover: 18 });
  stamp(p, ghost, t, 88, 75, { seed: o.seed, hover: 14 });
}
