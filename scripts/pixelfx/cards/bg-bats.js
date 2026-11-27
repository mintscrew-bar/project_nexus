// Nexus card "박쥐 떼" backdrop: a purple night, a big full moon, a castle on the hill.
import { sky, halo, ridge, stars, moon, castle } from "./_bg.js";
import { CARD } from "./_card.js";
export const meta = { name: "Card bg: bats", desc: "Purple night, full moon, castle on the hill.", tags: ["card", "bg"], ...CARD, duration: 0.05, loop: true, fps: 20, bg: "dark", options: { seed: 1 } };

export function draw(p) {
  sky(p, ["#120a22", "#1b1030", "#26163f", "#331d4f", "#45285f"], 0, 82, 1);
  stars(p, 28, 9, 56, ["#5b4682", "#a48ac8", "#ffffff"]);
  halo(p, 20, 18, 30, "#ffe0a0", 0.32);
  moon(p, 20, 18, 11);
  ridge(p, 70, 8, 26, 2, "#1d1230");
  castle(p, 70, [[70, 8, 26, 7], [79, 10, 18], [90, 6, 30, 6], [97, 9, 14], [62, 6, 14]], "#140c22", "#ffb85a");
  ridge(p, 77, 4, 9, 5, "#0e0818", { rim: "#2c1d45" });
}
