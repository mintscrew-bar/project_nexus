// Nexus card "전설의 검" as one live scene: the sanctum wall and window → weather/god-rays (shafts of light falling
// through the room from the upper left, breathing and swaying, dust motes lighting up in them; its dark air thinned
// so the wall still shows) → the pillars and banner → the floor and altar steps → the sword on its pedestal with
// its pillar of light, rune ring, shards and candles (card-sword) → god-rays' front motes.
import * as rays from "../weather/god-rays.js";
import * as sword from "./card-sword.js";
import { swordWall, swordPillars, swordFloor } from "./bg-sword.js";
import { CARD } from "./_card.js";

export const meta = {
  name: "Card scene: sword", desc: "Stone sanctum: shafts of light sway through it with dust motes, the sword glows on its altar.",
  tags: ["card", "scene", "sword", "light", "loop"], ...CARD, duration: 10, loop: true, fps: 12, bg: "dark", options: { seed: 4 },
};

// cold daylight to match the blue sanctum: [air, ..., white-hot core]
const DAY = ["#0c1220", "#1a2a48", "#3a5a8a", "#6a90c4", "#a4c4ec", "#d8e8ff", "#ffffff"];

function raysAt(p, t, layer) {
  const save = { tx: p.tx, ty: p.ty, fade: p.fade };
  p.place(save.tx + 170, save.ty + 80);
  p.fade = layer === "drawBack" ? 0.35 : 1; // thin the dark air; the beams' light is additive and stays
  rays[layer](p, t % rays.meta.duration, { palette: DAY, seed: 2 });
  Object.assign(p, save);
}

export function draw(p, t, o) {
  swordWall(p);
  raysAt(p, t, "drawBack");
  swordPillars(p);
  swordFloor(p);
  sword.draw(p, t * 0.8, { ...sword.meta.options, seed: o.seed }); // the sword's 4 s loop slowed to 5 s: two in 10
  raysAt(p, t, "draw");
}
