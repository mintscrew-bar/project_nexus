// Shared by the Nexus card scenes: every card is 110 x 92 with its origin at the top-left, so local coordinates
// are card pixels. A scene is library effects stamped at places on the card, each on its own clock.
import { resolveOptions } from "../../core/fx.js";

export const CARD = { size: [110, 92], origin: [0, 0] };

/**
 * Draw a pure (loop) effect module at (x, y) on the card, at time t on its own loop.
 * opts: the effect's own options; flip mirrors it, fade (0..1) dithers it out, speed scales its clock, phase shifts it.
 */
export function stamp(p, mod, t, x, y, { flip = false, fade = 1, speed = 1, phase = 0, ...opts } = {}) {
  const meta = mod.meta ?? {};
  const o = resolveOptions(meta, opts);
  const D = meta.duration ?? 1;
  const lt = ((((t * speed + phase) % D) + D) % D);
  const save = { tx: p.tx, ty: p.ty, fx: p.fx, cs: p.cs, sn: p.sn, fade: p.fade };
  p.place(save.tx + x, save.ty + y, flip);
  p.fade = save.fade * fade;
  if (mod.drawBack) mod.drawBack(p, lt, o);
  if (mod.draw) mod.draw(p, lt, o);
  Object.assign(p, save);
}
