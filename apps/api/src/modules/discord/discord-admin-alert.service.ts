import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DiscordBotService } from "./discord-bot.service";

type AdminAlertChannel =
  | "APPROVAL"
  | "REPORT"
  | "APPEAL"
  | "OPERATION"
  | "SECURITY";

interface AlertPayload {
  title: string;
  message: string;
  fields?: Record<string, string | number | null | undefined>;
  link?: string;
}

const CHANNEL_ENV: Record<AdminAlertChannel, string> = {
  APPROVAL: "ADMIN_ALERT_DISCORD_APPROVAL_CHANNEL_ID",
  REPORT: "ADMIN_ALERT_DISCORD_REPORT_CHANNEL_ID",
  APPEAL: "ADMIN_ALERT_DISCORD_APPEAL_CHANNEL_ID",
  OPERATION: "ADMIN_ALERT_DISCORD_OPERATION_CHANNEL_ID",
  SECURITY: "ADMIN_ALERT_DISCORD_SECURITY_CHANNEL_ID",
};

@Injectable()
export class DiscordAdminAlertService {
  private readonly logger = new Logger(DiscordAdminAlertService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly discordBotService: DiscordBotService,
  ) {}

  private getAppUrl() {
    return this.configService.get<string>("APP_URL") || "http://localhost:3000";
  }

  private resolveLink(link?: string) {
    if (!link) return undefined;
    if (/^https?:\/\//.test(link)) return link;
    return `${this.getAppUrl()}${link.startsWith("/") ? link : `/${link}`}`;
  }

  private async send(
    channel: AdminAlertChannel,
    payload: AlertPayload,
  ): Promise<boolean> {
    const guildId =
      this.configService.get<string>("ADMIN_ALERT_DISCORD_GUILD_ID") ||
      this.configService.get<string>("DISCORD_GUILD_ID");
    const channelId =
      this.configService.get<string>(CHANNEL_ENV[channel]) ||
      this.configService.get<string>("ADMIN_ALERT_DISCORD_CHANNEL_ID");

    if (!guildId || !channelId) {
      this.logger.warn(
        `Admin alert skipped: missing guild/channel config for ${channel}`,
      );
      return false;
    }

    const fields = Object.entries(payload.fields ?? {})
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => `- ${key}: ${value}`);
    const link = this.resolveLink(payload.link);
    const message = [
      `**${payload.title}**`,
      payload.message,
      fields.length ? "" : null,
      ...fields,
      link ? "" : null,
      link ? `바로가기: ${link}` : null,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1900);

    try {
      return this.discordBotService.sendNotification(guildId, channelId, message);
    } catch (error: any) {
      this.logger.warn(
        `Admin alert failed (${channel}): ${error?.message ?? error}`,
      );
      return false;
    }
  }

  async notifyDiscordGuildApprovalPending(params: {
    linkId: string;
    guildId: string;
    guildName?: string | null;
    ownerId: string;
    ownerName?: string | null;
    status: string;
  }) {
    await this.send("APPROVAL", {
      title: "Discord 서버 연동됨 (자동 승인)",
      message:
        "새 Discord 서버가 자동 승인되었습니다. 문제가 있으면 관리자 페이지에서 취소(비활성화)하세요.",
      fields: {
        "링크 ID": params.linkId,
        "길드 ID": params.guildId,
        "길드명": params.guildName,
        "요청자": params.ownerName
          ? `${params.ownerName} (${params.ownerId})`
          : params.ownerId,
        "상태": params.status,
      },
      link: "/admin",
    });
  }

  async notifyReportSubmitted(params: {
    reportId: string;
    reportType: "USER" | "POST" | "COMMENT";
    reporterId: string;
    reporterName?: string | null;
    targetId?: string | null;
    targetName?: string | null;
    reason: string;
  }) {
    await this.send("REPORT", {
      title: "신고 접수",
      message:
        params.reportType === "USER"
          ? "새 유저 신고가 접수되었습니다."
          : "새 커뮤니티 신고가 접수되었습니다.",
      fields: {
        "신고 ID": params.reportId,
        "유형": params.reportType,
        "신고자": params.reporterName
          ? `${params.reporterName} (${params.reporterId})`
          : params.reporterId,
        "대상": params.targetName
          ? `${params.targetName} (${params.targetId})`
          : params.targetId,
        "사유": params.reason,
      },
      link: "/admin",
    });
  }

  async notifyAppealSubmitted(params: {
    appealId: string;
    userId: string;
    username?: string | null;
  }) {
    await this.send("APPEAL", {
      title: "제재 이의신청 접수",
      message: "새 이의신청이 접수되었습니다.",
      fields: {
        "이의신청 ID": params.appealId,
        "유저": params.username
          ? `${params.username} (${params.userId})`
          : params.userId,
      },
      link: "/admin",
    });
  }

  async notifyAdminOperation(params: {
    operation: string;
    adminId: string;
    adminName?: string | null;
    targetType?: string;
    targetId?: string;
    summary?: string;
  }) {
    return this.send("OPERATION", {
      title: "관리자 민감 작업",
      message: params.summary || "관리자 작업이 수행되었습니다.",
      fields: {
        "작업": params.operation,
        "관리자": params.adminName
          ? `${params.adminName} (${params.adminId})`
          : params.adminId,
        "대상 유형": params.targetType,
        "대상 ID": params.targetId,
      },
      link: "/admin",
    });
  }

  async notifyTestAlert(params: {
    adminId: string;
    adminName?: string | null;
  }) {
    return this.send("APPROVAL", {
      title: "Discord 권한 인증 알림 테스트",
      message: "Discord 권한 인증 채널 테스트 메시지입니다.",
      fields: {
        "실행자": params.adminName
          ? `${params.adminName} (${params.adminId})`
          : params.adminId,
        "전송 시각": new Date().toISOString(),
      },
      link: "/admin",
    });
  }

  async notifyDiscordGuildPermissionFailure(params: {
    linkId: string;
    guildId: string;
    guildName?: string | null;
    requesterId: string;
    requesterName?: string | null;
    reason: string;
    missingPermissions?: string;
  }) {
    await this.send("SECURITY", {
      title: "Discord 길드 권한 검증 실패",
      message: params.reason,
      fields: {
        "링크 ID": params.linkId,
        "길드 ID": params.guildId,
        "길드명": params.guildName,
        "요청자": params.requesterName
          ? `${params.requesterName} (${params.requesterId})`
          : params.requesterId,
        "부족 권한": params.missingPermissions,
      },
      link: "/admin",
    });
  }
}
