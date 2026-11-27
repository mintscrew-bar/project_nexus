// Nexus card "천둥번개": the pixelfx weather/storm effect as it is — a churning cloud deck filling the top of the card,
// rain at two depths, a forked bolt with a double flash and sheet lightning in the clouds — with the card's own sea,
// cliff and lighthouse drawn over its lower half, so the bolt goes down behind the horizon into the sea. The
// lighthouse lamp turns and sweeps its beam over the water.
import * as storm from "../weather/storm.js";
import { seaAndCoast } from "./bg-storm.js";
import { CARD, stamp } from "./_card.js";
import { hex, WHITE } from "../../core/index.js";

export const meta = {
  name: "Card: storm", desc: "weather/storm's cloud deck, rain and lightning over the card's sea and lighthouse.",
  tags: ["card", "lightning", "storm", "rain", "loop"], ...CARD, duration: 10, loop: true, fps: 15, bg: "dark",
  options: { seed: 5 },
};

const D = meta.duration;

export function draw(p, t, o) {
  // the deck's underside (local y -170 .. -130) fills the top 40 px of the card; its floor far below, off the card
  stamp(p, storm, t, 8, 170, { seed: o.seed });
  seaAndCoast(p);
  // the lighthouse lamp and its turning beam
  const LX = 97, LY = 32.5, turn = (t / (D / 5)) * Math.PI * 2, face = Math.cos(turn), lamp = 0.6 + 0.4 * Math.max(0, face);
  p.px(LX - 1, 32, hex("#fff2b0")); p.px(LX, 32, WHITE); p.px(LX + 1, 32, hex("#fff2b0")); p.px(LX, 33, hex("#ffd870"));
  p.glow(LX, LY, 10, hex("#ffe8a0"), 0.6 * lamp);
  const len = 70 * Math.max(0, face);
  if (len > 2) {
    p.shade(Math.max(0, LX - len), LY - 10, LX, LY + 10, (x, y, out) => {
      const u = (LX - x) / len; if (u <= 0 || u > 1) return;
      const half = 0.8 + u * 7 * (0.5 + 0.5 * face), d = Math.abs(y + 0.5 - LY - u * 3) / half;
      if (d >= 1) return;
      out.l = hex("#ffe8a0");
      out.k = 0.32 * (1 - d) * (1 - u) * face;
    });
  }
}
