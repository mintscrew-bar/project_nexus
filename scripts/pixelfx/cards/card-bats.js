// Nexus card "박쥐 떼": three bats flap their figure-eights over the top of the card, out of step.
import * as bat from "../critters/bat.js";
import { CARD, stamp } from "./_card.js";

export const meta = {
  name: "Card: bats", desc: "Three bats flap figure-eights across the top of the card, each on its own beat.",
  tags: ["card", "bat", "loop"], ...CARD, duration: 4.8, loop: true, fps: 20, bg: "dark", options: { seed: 1 },
};

export function draw(p, t, o) {
  stamp(p, bat, t, 18, 26, { seed: o.seed, phase: 0.3, flip: true });
  stamp(p, bat, t, 94, 20, { seed: o.seed + 1, phase: 1.5 });
  stamp(p, bat, t, 80, 56, { seed: o.seed + 2, phase: 0.8, speed: 0.5, fade: 0.8 });
}
