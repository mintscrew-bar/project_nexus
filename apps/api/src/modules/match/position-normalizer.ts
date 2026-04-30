type RiotParticipantPosition = {
  teamPosition?: string | null;
  individualPosition?: string | null;
  lane?: string | null;
  role?: string | null;
};

export function normalizeRiotPosition(
  participant?: RiotParticipantPosition | string | null,
): string {
  const raw =
    typeof participant === "string"
      ? participant
      : participant?.teamPosition ||
        participant?.individualPosition ||
        normalizeLaneRole(participant?.lane, participant?.role);

  const value = (raw || "").toUpperCase();
  switch (value) {
    case "TOP":
      return "TOP";
    case "JUNGLE":
      return "JUNGLE";
    case "MIDDLE":
    case "MID":
      return "MID";
    case "BOTTOM":
    case "BOT":
    case "ADC":
      return "ADC";
    case "UTILITY":
    case "SUPPORT":
      return "SUPPORT";
    default:
      return "UNKNOWN";
  }
}

function normalizeLaneRole(
  lane?: string | null,
  role?: string | null,
): string | null {
  const normalizedLane = (lane || "").toUpperCase();
  const normalizedRole = (role || "").toUpperCase();

  if (normalizedLane === "MIDDLE") return "MID";
  if (normalizedLane === "JUNGLE") return "JUNGLE";
  if (normalizedLane === "TOP") return "TOP";
  if (normalizedLane === "BOTTOM") {
    return normalizedRole === "DUO_SUPPORT" ? "SUPPORT" : "ADC";
  }

  return null;
}
