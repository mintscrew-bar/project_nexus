// Nexus card "전설의 검" backdrop: a dark stone sanctum, shafts of light falling from above, a worn altar floor.
import { sky, halo, ridge, W, H } from "./_bg.js";
import { CARD } from "./_card.js";
import { hex, rand } from "../../core/index.js";
export const meta = { name: "Card bg: sword", desc: "Stone sanctum with shafts of light.", tags: ["card", "bg"], ...CARD, duration: 0.05, loop: true, fps: 20, bg: "dark", options: { seed: 1 } };

export function draw(p) {
  sky(p, ["#0c1220", "#111a2c", "#17223a", "#1e2c48", "#263656"], 0, 76, 1);
  // stone blocks on the back wall: a slightly darker mortar grid, rows offset
  const mortar = hex("#0f1726");
  for (let y = 4; y < 76; y += 7) {
    p.rect(0, y, W, 1, mortar);
    for (let x = ((y / 7) % 2) * 6; x < W; x += 12) p.rect(x, y, 1, 7, mortar);
  }
  // shafts of light slanting down from a high window
  const beam = hex("#8fb4e8");
  p.shade(0, 0, W - 1, 78, (x, y, o) => {
    const u = (x - 0.45 * y);
    for (const [c, w] of [[22, 5], [44, 3], [70, 6], [96, 3]]) {
      const d = Math.abs(u - c) / w;
      if (d < 1) { o.l = beam; o.k = 0.14 * (1 - d) * (1 - y / 90); return; }
    }
  });
  halo(p, 90, 70, 24, "#7fb0ff", 0.35);
  // the floor: flagstones with lit edges
  ridge(p, 77, 0, 10, 1, "#141c2e");
  const edge = hex("#33456a"), crack = hex("#0c1322");
  p.rect(0, 77, W, 1, edge);
  for (let x = 0; x < W; x += 14) p.rect(x + Math.round(rand(x, 3) * 4), 78, 1, 14, crack);
}
