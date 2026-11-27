// Nexus card "픽셀 화염" backdrop: a smoky red sky over black hills, the glow of the blaze rising off them.
import { sky, halo, ridge, stars } from "./_bg.js";
import { CARD } from "./_card.js";
export const meta = { name: "Card bg: fire", desc: "Smoky red night over black hills.", tags: ["card", "bg"], ...CARD, duration: 0.05, loop: true, fps: 20, bg: "dark", options: { seed: 1 } };

export function draw(p) {
  sky(p, ["#120607", "#1c0a09", "#2a0f0b", "#3d150d", "#57200f"], 0, 92, 1.2);
  stars(p, 12, 4, 30, ["#4a1e16", "#8a3a22", "#ffb070"]);
  halo(p, 55, 92, 70, "#ff6a2a", 0.3);
  ridge(p, 52, 12, 24, 2, "#1a0806");
  ridge(p, 60, 8, 14, 5, "#120504");
}
