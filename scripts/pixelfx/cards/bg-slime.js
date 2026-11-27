// Nexus card "통통 슬라임" backdrop: a green dusk over a misty forest edge, layered hills and pines, a grass bank.
import { sky, halo, ridge, stars, fogBand, W, H } from "./_bg.js";
import { CARD } from "./_card.js";
import { hex, rand } from "../../core/index.js";
export const meta = { name: "Card bg: slime", desc: "Green dusk over layered forest hills.", tags: ["card", "bg"], ...CARD, duration: 0.05, loop: true, fps: 20, bg: "dark", options: { seed: 1 } };

function pines(p, baseY, n, seed, c, hMin, hMax) {
  const col = hex(c);
  for (let i = 0; i < n; i++) {
    const x = Math.round(rand(i, seed) * W), h = hMin + rand(i, seed + 1) * (hMax - hMin);
    for (let r = 0; r < h; r++) {
      const half = Math.max(0, Math.round((r / h) * (h * 0.32)) - ((r % 4) === 0 ? 1 : 0));
      p.rect(x - half, baseY - h + r, half * 2 + 1, 1, col);
    }
  }
}

export function draw(p) {
  sky(p, ["#0d2420", "#123229", "#1a4433", "#25583c", "#356e45"], 0, 70, 0.9);
  halo(p, 55, 14, 46, "#9fe08a", 0.35);
  stars(p, 18, 11, 30, ["#3d7a55", "#7fc28a", "#d8ffd0"]);
  ridge(p, 58, 10, 22, 4, "#1d4a35");
  pines(p, 62, 9, 21, "#173d2c", 10, 18);
  ridge(p, 66, 7, 14, 7, "#123326");
  pines(p, 70, 7, 33, "#0f2a20", 12, 22);
  fogBand(p, 66, 6, "#6fbf86", 0.35);
  ridge(p, 79, 3, 6, 9, "#0b2219", { jag: 2, rim: "#2f7a3e" });
}
