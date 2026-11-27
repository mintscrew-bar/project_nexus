// Nexus card "전설의 검": a sword planted beside the portrait in a tall pillar of blue light (pickups/loot-beam).
import * as beam from "../pickups/loot-beam.js";
import { CARD, stamp } from "./_card.js";

export const meta = {
  name: "Card: sword", desc: "A legendary sword stands in a pillar of blue light beside the portrait, glints rising off it.",
  tags: ["card", "sword", "light", "loop"], ...CARD, duration: 2.4, loop: true, fps: 20, bg: "dark", options: { seed: 4 },
};

export function draw(p, t, o) {
  stamp(p, beam, t, 90, 76, { seed: o.seed,
    palette: ["#06122a", "#0c2450", "#123a86", "#1e5ec0", "#3a8af0", "#82c0ff", "#d4ecff", "#ffffff"] });
}
