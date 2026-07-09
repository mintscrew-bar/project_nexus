const BROADCAST_CONTROL_WIDTH = 820;
const BROADCAST_CONTROL_HEIGHT = 540;

export function openBroadcastControlWindow(path = "/broadcast-control") {
  if (typeof window === "undefined") return;

  const left = Math.max(0, window.screenX + window.outerWidth - BROADCAST_CONTROL_WIDTH - 24);
  const top = Math.max(0, window.screenY + 72);
  const features = [
    `width=${BROADCAST_CONTROL_WIDTH}`,
    `height=${BROADCAST_CONTROL_HEIGHT}`,
    `left=${left}`,
    `top=${top}`,
    "popup=yes",
    "resizable=yes",
    "scrollbars=yes",
    "noopener=yes",
    "noreferrer=yes",
  ].join(",");

  window.open(path, "nexus-broadcast-control", features);
}
