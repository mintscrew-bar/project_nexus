"use client";

import { useEffect } from "react";

/**
 * Hide native right-click / drag-save interactions for cosmetic media.
 * This is a UI deterrent only: publicly served assets can still be retrieved
 * using browser network tools. Actual asset protection requires authenticated
 * media delivery rather than public URLs.
 */
export function CosmeticMediaProtection() {
  useEffect(() => {
    const isProtected = (target: EventTarget | null): boolean => {
      if (!(target instanceof Element)) return false;
      if (target.closest(".cfx-root")) return true;

      // Animated cosmetic videos often sit beneath text/avatar overlays with
      // pointer-events disabled. Also protect the overlaid card/banner surface.
      let node: Element | null = target;
      for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
        if (node.querySelector(".cfx-root video")) return true;
      }
      return false;
    };

    const deny = (event: Event) => {
      if (isProtected(event.target)) event.preventDefault();
    };

    // Capture phase runs before native video menus and card event handlers.
    document.addEventListener("contextmenu", deny, true);
    document.addEventListener("dragstart", deny, true);
    return () => {
      document.removeEventListener("contextmenu", deny, true);
      document.removeEventListener("dragstart", deny, true);
    };
  }, []);
  return null;
}
