// Nexus card "박쥐 떼" as one live scene, so effects sit between the scenery instead of under it:
// sky → weather/clouds (the moon, cloud layers drifting past it, silver edges where they cross it) → violet peaks →
// weather/fog's back banks (mist behind the castle) → the castle on its crag, windows flickering → the moor →
// weather/fog's front bank and streaks (mist through the castle's foot and over the moor) → three bats → the branch.
import * as clouds from "../weather/clouds.js";
import * as fog from "../weather/fog.js";
import * as bat from "../critters/bat.js";
import { batsSky, batsPeaks, batsCastle, batsMoor, batsBranch } from "./bg-bats.js";
import { CARD } from "./_card.js";
import { stamp } from "./_card.js";
import { hex, rand } from "../../core/index.js";

export const meta = {
  name: "Card scene: bats", desc: "Moonlit castle: clouds drift past the moon, mist winds through the castle's foot, bats flap in front.",
  tags: ["card", "scene", "bat", "loop"], ...CARD, duration: 12, loop: true, fps: 12, bg: "dark", options: { seed: 1 },
};

// index 5 is also the moon's seas in weather/clouds: kept pale so they don't read as a face
const NIGHT = ["#0c0818", "#160d2a", "#22163c", "#33224e", "#4a3466", "#c8b8e6", "#dcd0f2", "#f8f2ff"];
const MIST = ["#120c20", "#1e1530", "#2c2044", "#3e2e5a", "#54426e", "#6e5a88", "#9a86b4", "#cfc2e6"];

/** the castle's lit windows flicker a little, each on its own beat */
function windowFlicker(p, t) {
  for (const [x, y, k] of [[83, 35, 0], [89, 40, 1], [95, 33, 2], [95, 41, 3], [105, 43, 4], [83, 44, 5]]) {
    const f = 0.5 + 0.5 * Math.sin(t * (2.3 + rand(k, 3)) * Math.PI * 2 / 2.4 + k);
    if (f > 0.75) p.px(x, y, hex("#fff0c0"));
    p.glow(x, y, 4, hex("#ffb85a"), 0.15 + 0.2 * f);
  }
}

export function draw(p, t, o) {
  batsSky(p);
  stamp(p, clouds, t, -68, 148, { palette: NIGHT, seed: 7 });
  batsPeaks(p);
  const save = { tx: p.tx, ty: p.ty };
  p.place(save.tx + 55, save.ty + 78);
  fog.drawBack(p, t % fog.meta.duration, { palette: MIST, seed: 3 });
  p.place(save.tx, save.ty);
  batsCastle(p);
  windowFlicker(p, t);
  batsMoor(p);
  p.place(save.tx + 55, save.ty + 78);
  fog.draw(p, t % fog.meta.duration, { palette: MIST, seed: 3 });
  p.place(save.tx, save.ty);
  stamp(p, bat, t, 18, 26, { seed: o.seed, phase: 0.3, flip: true });
  stamp(p, bat, t, 94, 20, { seed: o.seed + 1, phase: 1.5 });
  stamp(p, bat, t, 70, 52, { seed: o.seed + 2, phase: 0.8, speed: 0.5 });
  batsBranch(p);
}
