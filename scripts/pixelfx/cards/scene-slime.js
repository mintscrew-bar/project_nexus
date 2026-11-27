// Nexus card "통통 슬라임" as one live scene: the sunset sky and clouds → violet mountains and the pine line →
// weather/fireflies' back layer (far fireflies and grass over the far edge of the clearing) → the clearing with its
// mushrooms → the two slimes hopping (card-slime) → weather/fireflies' front layer (near fireflies glowing past the
// slimes) → ferns in the corners. Dusk, so the fireflies are coming out.
import * as flies from "../weather/fireflies.js";
import * as slimes from "./card-slime.js";
import { slimeSky, slimeHills, slimeMeadow, slimeFerns } from "./bg-slime.js";
import { CARD } from "./_card.js";

export const meta = {
  name: "Card scene: slime", desc: "Sunset clearing: fireflies come out over the meadow while two slimes hop.",
  tags: ["card", "scene", "slime", "loop"], ...CARD, duration: 12, loop: true, fps: 12, bg: "dark", options: { seed: 1 },
};

// warm fireflies to sit in a sunset: [dark grass .. white-hot]
const FLIES = ["#3a3a14", "#7a6a1a", "#d0b02a", "#ffe05a", "#fff4b8", "#ffffff"];

function fliesAt(p, t, layer) {
  const save = { tx: p.tx, ty: p.ty, fade: p.fade };
  p.place(save.tx + 55, save.ty + 74);
  // its back layer lays a night haze over everything; thinned so the sunset keeps its colour
  if (layer === "drawBack") p.fade = 0.35;
  flies[layer](p, t % flies.meta.duration, { ...flies.meta.options, palette: FLIES, seed: 6 });
  Object.assign(p, save);
}

export function draw(p, t, o) {
  slimeSky(p);
  slimeHills(p);
  fliesAt(p, t, "drawBack");
  slimeMeadow(p);
  slimes.draw(p, t * 0.9, { seed: o.seed }); // the slimes' 1.8 s hop slowed to 2 s: six in 12
  fliesAt(p, t, "draw");
  slimeFerns(p);
}
