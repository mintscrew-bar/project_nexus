// Nexus card "꼬마 유령" as one live scene: sky → far hill with the chapel → weather/fog's back banks (mist rolling
// behind the graveyard) → the gnarled tree, its lantern flickering → the middle rise with the fence → the near slope
// with the big stones → the ghosts and will-o'-wisps (card-ghost) → the dark grass at the corners → weather/fog's
// front bank and streaks drifting over everything low.
import * as fog from "../weather/fog.js";
import * as ghosts from "./card-ghost.js";
import { ghostSky, ghostFar, ghostTree, ghostMid, ghostNear, ghostCorners } from "./bg-ghost.js";
import { CARD } from "./_card.js";
import { hex } from "../../core/index.js";

export const meta = {
  name: "Card scene: ghost", desc: "Moonlit graveyard: fog rolls between the graves, the lantern flickers, ghosts bob, wisps drift.",
  tags: ["card", "scene", "ghost", "loop"], ...CARD, duration: 12, loop: true, fps: 12, bg: "dark", options: { seed: 1 },
};

const MIST = ["#0c1022", "#141a32", "#1e2846", "#2c3a5e", "#40507a", "#5c6e9a", "#8a9cc6", "#c4d0ee"];

// the back banks roll behind the graveyard; the front bank hugs the ground low, under the name bar, so it never
// washes over the stones or the ghosts
function fogAt(p, t, layer, y) {
  const save = { tx: p.tx, ty: p.ty };
  p.place(save.tx + 55, save.ty + y);
  fog[layer](p, t % fog.meta.duration, { palette: MIST, seed: 4 });
  p.place(save.tx, save.ty);
}

export function draw(p, t, o) {
  ghostSky(p);
  ghostFar(p);
  fogAt(p, t, "drawBack", 86);
  ghostTree(p);
  // the lantern's flame breathes
  const f = 0.6 + 0.25 * Math.sin(t * 5.2) + 0.15 * Math.sin(t * 13.1);
  p.px(26, 46, hex(f > 0.8 ? "#ffffff" : "#dffff4"));
  p.glow(26, 47, 14, hex("#9fe8d0"), 0.25 * f);
  ghostMid(p);
  ghostNear(p);
  ghosts.draw(p, t * 0.8, { seed: o.seed }); // ghosts loop every 4.8 s; slowed to 6 s so 12 s holds two
  ghostCorners(p);
  fogAt(p, t, "draw", 98);
}
