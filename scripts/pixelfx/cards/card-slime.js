// Nexus card "통통 슬라임": a big slime hops on the right of the portrait, a smaller, darker one on the left
// hops after it half a beat later. Both from critters/slime.
import * as slime from "../critters/slime.js";
import { CARD, stamp } from "./_card.js";

export const meta = {
  name: "Card: slime", desc: "Two slimes hop beside the portrait, the second half a beat behind the first.",
  tags: ["card", "slime", "loop"], ...CARD, duration: 3.6, loop: true, fps: 20, bg: "dark", options: { seed: 1 },
};

export function draw(p, t, o) {
  stamp(p, slime, t, 88, 76, { seed: o.seed, hop: 20 });
  stamp(p, slime, t, 22, 79, { seed: o.seed + 3, hop: 12, flip: true, phase: 0.9,
    palette: ["#05100e", "#0a2622", "#0f4a3d", "#1a7642", "#3aa846", "#8ad65a", "#e0f8c0"] });
}
