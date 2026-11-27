// Nexus card "전설의 검" backdrop: a dark stone sanctum. An arched window high on the left throws shafts of light
// across it, stone pillars stand at both edges, a blue banner with a gold sword hangs by the window, and the sword's
// altar is two worn steps on the right.
import { sky, halo, W } from "./_bg.js";
import { CARD } from "./_card.js";
import { hex, rand } from "../../core/index.js";
export const meta = { name: "Card bg: sword", desc: "Stone sanctum: arched window, light shafts, pillars, banner, altar steps.", tags: ["card", "bg"], ...CARD, duration: 0.05, loop: true, fps: 20, bg: "dark", options: { seed: 1 } };

const INK = hex("#070a14");
const STONE = ["#121a2a", "#1a2438", "#243049", "#33415e", "#4a5a7c"].map(hex);
const GOLD = ["#5a3b12", "#b8862a", "#e8bd52"].map(hex);

function pillar(p, x, w) {
  p.rect(x, 0, w, 80, STONE[2]);
  p.rect(x, 0, 1, 80, STONE[4]);
  p.rect(x + w - 1, 0, 1, 80, STONE[0]);
  for (let k = 2; k < w - 2; k += 2) p.rect(x + k, 6, 1, 66, STONE[1]); // flutes
  // capital and base
  p.rect(x - 1, 2, w + 2, 4, STONE[3]); p.rect(x - 1, 2, w + 2, 1, STONE[4]); p.rect(x - 1, 5, w + 2, 1, INK);
  p.rect(x - 2, 72, w + 4, 5, STONE[3]); p.rect(x - 2, 72, w + 4, 1, STONE[4]); p.rect(x - 2, 76, w + 4, 1, INK);
}

// The scene in parts, so a live scene (scene-sword) can put weather/god-rays between the wall and the pillars.
// draw() below is the still backdrop with its own simple shafts.
export function swordWall(p) {
  sky(p, ["#0c1220", "#111a2c", "#17223a", "#1e2c48", "#263656"], 0, 80, 1);
  // stone blocks on the back wall: a darker mortar grid, rows offset
  const mortar = hex("#0f1726");
  for (let y = 4; y < 80; y += 7) {
    p.rect(0, y, W, 1, mortar);
    for (let x = ((y / 7) % 2) * 6; x < W; x += 12) p.rect(x, y, 1, 7, mortar);
  }

  // the arched window, high on the left: an ink frame, mullions, glass bright at the top
  const WX = 10, WY = 5, WW = 13, WH = 22, r = WW / 2;
  p.shade(WX - 1, WY - 1, WX + WW, WY + WH, (x, y) => {
    const cx = WX + r - 0.5, top = WY + r;
    const inside = y >= top ? x >= WX && x < WX + WW : Math.hypot(x - cx, y - top) <= r;
    const frame = y >= top ? x >= WX - 1 && x <= WX + WW : Math.hypot(x - cx, y - top) <= r + 1.2;
    if (!frame) return;
    if (!inside || y >= WY + WH - 1) return INK;
    if (x === Math.round(cx) || y === top + 4 || y === top + 10) return INK; // lead
    return (y - WY) / WH < 0.35 ? hex("#d4ecff") : (y - WY) / WH < 0.7 ? hex("#82c0ff") : hex("#3a8af0");
  });
  p.rect(WX - 2, WY + WH - 1, WW + 4, 2, STONE[3]); // sill
  halo(p, WX + r, WY + 8, 22, "#8fb4e8", 0.35);

}
export function swordBeams(p) {
  const WX = 10, WY = 5, WW = 13, WH = 22;
  // shafts of light slanting from the window down to the right
  const beam = hex("#8fb4e8");
  p.shade(0, WY, W - 1, 80, (x, y, o) => {
    const u = x - (y - WY) * 0.9;
    for (const [c, w] of [[WX + 2, 2.5], [WX + 7, 3.5], [WX + 11, 2]]) {
      const d = Math.abs(u - c) / w;
      if (d < 1 && y > WY + WH - 4) { o.l = beam; o.k = 0.13 * (1 - d) * (1 - (y - WY) / 90); return; }
    }
  });

}
export function swordPillars(p) {
  // a banner by the window: dark blue cloth, gold trim and a gold sword, a swallowtail hem
  const BX = 26, BW = 7;
  p.rect(BX - 1, 2, BW + 2, 1, GOLD[0]);
  p.shade(BX, 3, BX + BW - 1, 34, (x, y) => {
    const hem = 30 + Math.abs(x - (BX + 3)) ;
    if (y > hem) return;
    if (x === BX || x === BX + BW - 1) return GOLD[1];
    return y % 9 === 0 ? hex("#16264a") : hex("#1c3160");
  });
  // the emblem: a sword point-down — round pommel, grip, a guard with drooping ends, a long blade to a point
  p.rect(BX + 2, 7, 3, 2, GOLD[1]); p.px(BX + 3, 7, GOLD[2]);
  p.px(BX + 3, 9, GOLD[0]); p.px(BX + 3, 10, GOLD[0]);
  p.rect(BX + 1, 11, 5, 1, GOLD[2]); p.px(BX + 1, 12, GOLD[1]); p.px(BX + 5, 12, GOLD[1]);
  for (let y = 12; y < 25; y++) { p.px(BX + 3, y, GOLD[2]); if (y < 22) p.px(BX + 4, y, GOLD[1]); }
  p.px(BX + 3, 25, GOLD[1]);

  // pillars at both edges
  pillar(p, 1, 6);
  pillar(p, W - 7, 6);

}
export function swordFloor(p) {
  // the floor and the altar: two worn steps on the right under the sword
  p.rect(0, 77, W, 15, STONE[1]);
  p.rect(0, 77, W, 1, STONE[3]);
  p.rect(58, 73, 52, 5, STONE[2]); p.rect(58, 73, 52, 1, STONE[4]); p.rect(58, 77, 52, 1, INK);
  p.rect(64, 69, 46, 4, STONE[3]); p.rect(64, 69, 46, 1, STONE[4]); p.rect(64, 72, 46, 1, INK);
  const crack = hex("#0c1322");
  for (let x = 4; x < W; x += 13) p.rect(x + Math.round(rand(x, 3) * 4), 78, 1, 14, crack);
  halo(p, 88, 70, 26, "#7fb0ff", 0.3);
}

export function draw(p) {
  swordWall(p); swordBeams(p); swordPillars(p); swordFloor(p);
}
