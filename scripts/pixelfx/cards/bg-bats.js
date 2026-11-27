// Nexus card "박쥐 떼" backdrop: a purple night over a vampire's castle. A huge full moon top left with moonlit violet
// clouds, violet peaks, the castle big on a crag on the right (towers, pointed roofs, a flag, warm
// lit windows), a rocky moor in layers with dead trees, and a gnarled branch reaching in from the bottom left.
import { sky, halo, ridge, stars, moon, puffCloud, W } from "./_bg.js";
import { CARD } from "./_card.js";
import { hex, rand } from "../../core/index.js";
export const meta = { name: "Card bg: bats", desc: "Purple night, full moon, castle on a crag, rocky moor, dead trees.", tags: ["card", "bg"], ...CARD, duration: 0.05, loop: true, fps: 20, bg: "dark", options: { seed: 1 } };

// castle stone, lit from the moon on the upper left: [lit edge, lit side, body, shadow side]
const ST = ["#4a3466", "#2e1f48", "#1e1432", "#120a20"].map(hex);
const ROOF = ["#5a2a4a", "#3a1a34", "#24101f"].map(hex); // dark wine slate roofs: lit slope, body, shadow
const WIN = hex("#ffb85a"), WIN_DIM = hex("#c8743a"), INK = hex("#08040e");

/** an arched window 2 wide, 3 tall with a rounded top; lit ones cast a little warm light */
function archWin(p, x, y, lit) {
  const c = lit ? WIN : WIN_DIM;
  p.px(x, y, c); p.rect(x - 1, y + 1, 2, 2, c); p.px(x - 1, y, INK);
  if (lit) halo(p, x, y + 1, 4, "#ffb85a", 0.3);
}

/** a round tower: shaded like a cylinder, a corbelled lip, a conical roof with flared eaves and a finial */
function roundTower(p, cx, base, w, h, roofH, wins = []) {
  const x0 = Math.round(cx - w / 2), top = base - h;
  for (let x = x0; x < x0 + w; x++) {
    const u = (x - x0) / (w - 1);
    p.rect(x, top, 1, h, u < 0.15 ? ST[0] : u < 0.45 ? ST[1] : u < 0.8 ? ST[2] : ST[3]);
  }
  p.rect(x0 - 1, top, w + 2, 1, ST[1]); p.px(x0 - 1, top, ST[0]); // corbelled lip
  p.rect(x0 - 1, top + 1, w + 2, 1, INK);
  // conical roof: flared eaves 1 px past the lip, curving in to a sharp tip
  for (let r = 0; r < roofH; r++) {
    const u = r / roofH, half = (w / 2 + 1.5) * Math.pow(1 - u, 1.35);
    const xl = Math.round(cx - half), xr = Math.round(cx + half);
    for (let x = xl; x <= xr; x++) {
      const v = (x - xl) / Math.max(1, xr - xl);
      p.px(x, top - 1 - r, v < 0.3 ? ROOF[0] : v < 0.7 ? ROOF[1] : ROOF[2]);
    }
  }
  p.px(Math.round(cx), top - 1 - roofH, ROOF[1]); p.px(Math.round(cx), top - 2 - roofH, ST[0]); // finial
  for (const [dy, lit] of wins) archWin(p, Math.round(cx), top + dy, lit);
}

/** a stretch of crenellated wall from x0 to x1 standing on base, h tall */
function wall(p, x0, x1, base, h) {
  p.rect(x0, base - h, x1 - x0, h, ST[2]);
  p.rect(x0, base - h, x1 - x0, 1, ST[1]);
  for (let x = x0; x < x1; x += 3) { p.rect(x, base - h - 2, 2, 2, ST[2]); p.px(x, base - h - 2, ST[1]); }
}

/** a bare dead tree in silhouette: trunk and a few crooked limbs */
function deadTree(p, x, base, h, c, flip = 1) {
  const col = hex(c);
  const line = (x0, y0, x1, y1, w) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= n; i++) { const u = i / n; p.rect(Math.round(x0 + (x1 - x0) * u - w / 2), Math.round(y0 + (y1 - y0) * u), w, 1, col); }
  };
  line(x, base, x + flip, base - h, 2);
  line(x + flip, base - h * 0.6, x + 5 * flip, base - h * 0.85, 1);
  line(x + flip, base - h * 0.75, x - 3 * flip, base - h, 1);
  line(x + flip, base - h, x + 3 * flip, base - h - 3, 1);
}

export function draw(p) {
  sky(p, ["#0e0820", "#160d2c", "#211438", "#2e1b48", "#3e2558", "#4e2f66"], 0, 74, 1, 0.55);
  stars(p, 30, 9, 50, ["#5b4682", "#a48ac8", "#ffffff"]);
  // the full moon, big, top left
  halo(p, 20, 20, 40, "#ffe0a0", 0.42);
  moon(p, 20, 20, 13);

  // moonlit clouds, dim violet, one drifting across the moon's foot
  const NIGHT = { out: "#1a1030", shade: "#3a2a56", mid: "#5a4678", hi: "#8a74aa" };
  puffCloud(p, 24, 36, 28, 3, NIGHT, 0.3);
  puffCloud(p, 62, 14, 22, 7, NIGHT, 0.4);
  // violet peaks, then the crag the castle stands on
  ridge(p, 54, 10, 16, 4, "#2a1a42");
  ridge(p, 60, 6, 10, 8, "#1f1434");
  // the castle on the crag, stepping up the rock: a low turret and wall on the left, the great keep with a steep
  // gabled roof and a rose window, a tall slender spire tower with a flag, a stout turret on the right edge
  const B = 57; // the castle's footing — the top of the crag drawn after it
  wall(p, 64, 74, B + 1, 7);
  roundTower(p, 66, B + 2, 5, 15, 9, [[5, 0]]);
  wall(p, 74, 108, B, 11);
  // the keep: a tall block with buttresses, a steep roof, a round window and two tall arched ones
  const KX = 76, KW = 14, KH = 26, KT = B - KH;
  for (let x = KX; x < KX + KW; x++) p.rect(x, KT, 1, KH, x === KX ? ST[0] : x < KX + 4 ? ST[1] : x < KX + 11 ? ST[2] : ST[3]);
  for (const bx of [KX - 1, KX + KW]) { p.rect(bx, B - 12, 1, 12, ST[2]); p.px(bx, B - 12, ST[1]); }
  for (let r = 0; r < 12; r++) {
    const half = (KW / 2 + 1) * (1 - r / 12), xl = Math.round(KX + KW / 2 - half), xr = Math.round(KX + KW / 2 + half) - 1;
    for (let x = xl; x <= xr; x++) p.px(x, KT - 1 - r, (x - xl) / Math.max(1, xr - xl) < 0.35 ? ROOF[0] : ROOF[1]);
  }
  p.circle(KX + 7, KT + 6, 2.2, INK); p.circle(KX + 7, KT + 6, 1.4, WIN); p.px(KX + 7, KT + 6, hex("#fff0c0"));
  halo(p, KX + 7, KT + 6, 7, "#ffb85a", 0.35);
  archWin(p, KX + 4, KT + 13, true); archWin(p, KX + 10, KT + 13, false);
  archWin(p, KX + 4, KT + 19, false); archWin(p, KX + 10, KT + 19, true);
  // the great door, lit from inside, under a pointed arch
  p.rect(KX + 5, B - 6, 4, 6, INK); p.rect(KX + 6, B - 5, 2, 5, WIN_DIM); p.px(KX + 6, B - 6, INK); p.px(KX + 7, B - 7, INK);
  // the tall spire tower behind the keep's right shoulder, the flag on its finial
  roundTower(p, 95, B, 6, 30, 13, [[6, 1], [14, 1], [22, 0]]);
  const fy = B - 30 - 13 - 6;
  p.rect(95, fy, 1, 5, INK);
  for (let k = 0; k < 3; k++) p.rect(96, fy + k, 4 - k, 1, hex("#a01e30"));
  p.px(99, fy, hex("#c83040"));
  // a stout turret on the right edge
  roundTower(p, 105, B, 7, 20, 10, [[6, 1], [13, 0]]);

  // the crag the castle stands on: a solid rock mass from the castle's footing down to the moor, wider at the
  // bottom, a moonlit left face and ledges, so the castle visibly sits on it
  const R = ["#140c22", "#22163a", "#33224e", "#4e3870"].map(hex);
  p.shade(52, B - 2, W - 1, 80, (x, y) => {
    const t = B - 1 + Math.round(1.5 * Math.sin(x / 4)) + Math.max(0, Math.round((64 - x) * 0.9)); // slopes down on the left
    if (y < t) return;
    if (y === t) return R[3];
    const face = x < 64 + (y - B) * 0.5; // the left face catches the moon
    const ledge = (y - B) % 6 === 0 && rand(Math.floor(x / 4), y, 19) > 0.4;
    return ledge ? R[3] : face ? R[2] : rand(Math.floor(x / 3), y, 23) > 0.85 ? R[2] : R[1];
  });
  // the moor in front: two rolling layers with moonlit rims, dead trees, rocks
  const mid = (x) => 66 + Math.round(2 * Math.sin(x / 14 + 0.5));
  p.shade(0, 60, W - 1, 91, (x, y) => (y < mid(x) ? undefined : y === mid(x) ? hex("#4a3266") : hex("#1c1230")));
  deadTree(p, 30, mid(30), 14, "#120a20", 1);
  deadTree(p, 58, mid(58), 10, "#120a20", -1);
  const near = (x) => 71 + Math.round(2 * Math.sin(x / 18 + 2));
  p.shade(0, 64, W - 1, 91, (x, y) => {
    const t0 = near(x);
    if (y < t0) return;
    if (y === t0) return hex("#5a3e78");
    return rand(Math.floor(x / 5), y, 41) > 0.9 && y < t0 + 6 ? hex("#2a1c40") : hex("#150c24");
  });
  for (const [x, w] of [[14, 4], [44, 3], [70, 5]]) {
    const y = near(x);
    p.rect(x - w, y - 2, w * 2 + 1, 3, hex("#2a1c3e")); p.rect(x - w + 1, y - 3, w * 2 - 1, 1, hex("#4a3466"));
  }
  // dry grass on the near rim
  for (let i = 0; i < 24; i++) {
    const x = Math.round(rand(i, 71) * W), y = near(x), h = 1 + Math.round(rand(i, 72) * 3);
    p.rect(x, y - h, 1, h, hex("#3a2852")); p.px(x, y - h, hex("#6a4a86"));
  }
  // a gnarled branch reaching in from the bottom left, nearest of all
  const br = hex("#08040f");
  const seg = (x0, y0, x1, y1, w0, w1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
    for (let i = 0; i <= n; i++) { const u = i / n; p.disc(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, Math.max(0.5, (w0 + (w1 - w0) * u) / 2), br); }
  };
  seg(-2, 92, 6, 70, 6, 4); seg(6, 70, 4, 56, 4, 2.5); seg(4, 56, 9, 46, 2.5, 1.2); seg(5, 64, 13, 60, 2, 1); seg(4, 56, 0, 50, 1.5, 1);
}
