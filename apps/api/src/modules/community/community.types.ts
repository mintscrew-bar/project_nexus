// Enums for Community module
// TODO: Move these to Prisma schema once database is updated

export enum PostCategory {
  NOTICE = "NOTICE",
  FREE = "FREE",
  TIP = "TIP",
  QNA = "QNA",
}

export enum ReportReason {
  TOXICITY = "TOXICITY",
  AFK = "AFK",
  GRIEFING = "GRIEFING",
  CHEATING = "CHEATING",
  OTHER = "OTHER",
}

export enum ReportStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum FriendshipStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  BLOCKED = "BLOCKED",
}

export enum BracketType {
  SINGLE = "SINGLE",
  ROUND_ROBIN = "ROUND_ROBIN",
  SINGLE_ELIMINATION = "SINGLE_ELIMINATION",
}

export enum MatchStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
}
