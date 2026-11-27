// Nexus card "꼬마 유령" backdrop: a blue night graveyard, crescent moon, a dead tree, crooked stones in the fog.
import { sky, halo, ridge, stars, moon, deadTree, tomb, fogBand } from "./_bg.js";
import { CARD } from "./_card.js";
export const meta = { name: "Card bg: ghost", desc: "Blue night graveyard with a crescent moon.", tags: ["card", "bg"], ...CARD, duration: 0.05, loop: true, fps: 20, bg: "dark", options: { seed: 1 } };

export function draw(p) {
  sky(p, ["#0b1022", "#111a33", "#182544", "#223257", "#30426b"], 0, 80, 1.1);
  stars(p, 30, 5, 50);
  halo(p, 92, 13, 22, "#c8d8ff", 0.4);
  moon(p, 92, 13, 7, { lit: "#eef2ff", mid: "#c9d3f0", dark: "#9aa6cc", crescent: -1, skyC: "#111a33" });
  ridge(p, 66, 6, 18, 3, "#141d36");
  deadTree(p, 14, 70, 34, "#0c1226", 3, 1);
  ridge(p, 74, 3, 10, 8, "#0e1529", { rim: "#2a3a60" });
  tomb(p, 28, 75, 6, 8, "#1a2440", "#3c4f7c");
  tomb(p, 84, 76, 5, 9, "#1a2440", "#3c4f7c", true);
  tomb(p, 98, 75, 6, 7, "#1a2440", "#3c4f7c");
  fogBand(p, 72, 7, "#7d8fc0", 0.45);
}
