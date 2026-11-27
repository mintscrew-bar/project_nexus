// Nexus card "천둥번개" backdrop: a dark storm sky with heavy banded clouds, a black sea-cliff horizon.
import { sky, ridge, W } from "./_bg.js";
import { CARD } from "./_card.js";
import { hex, noise } from "../../core/index.js";
export const meta = { name: "Card bg: storm", desc: "Storm sky with heavy pixel clouds.", tags: ["card", "bg"], ...CARD, duration: 0.05, loop: true, fps: 20, bg: "dark", options: { seed: 1 } };

function cloudBank(p, y, amp, wave, seed, body, lit) {
  const B = hex(body), L = hex(lit);
  for (let x = 0; x < W; x++) {
    const bottom = Math.round(y + amp * (0.5 + 0.5 * noise(x / wave, seed)) + 2 * noise(x / 3, seed + 9));
    for (let yy = 0; yy <= bottom; yy++) p.px(x, yy, yy >= bottom - 1 ? L : B);
  }
}

export function draw(p) {
  sky(p, ["#0a1024", "#0f1730", "#152040", "#1c2a52", "#243566"], 0, 84, 1);
  cloudBank(p, 26, 10, 14, 3, "#1d2848", "#2f3e6a");
  cloudBank(p, 16, 8, 11, 5, "#161f3a", "#283660");
  cloudBank(p, 6, 6, 8, 8, "#10172c", "#202b4e");
  ridge(p, 76, 5, 20, 6, "#070b18", { rim: "#1e2a50" });
}
