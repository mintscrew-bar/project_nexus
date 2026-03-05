import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { ClanService } from "./clan.service";
import {
  CreateClanDto,
  UpdateClanDto,
  UpdateMemberRoleDto,
  TransferOwnershipDto,
  ContentDto,
  JoinByCodeDto,
  InviteUserDto,
  ResolveDto,
} from "./dto";
import { ClanGateway } from "./clan.gateway";

@Controller("clans")
@UseGuards(JwtAuthGuard)
export class ClanController {
  constructor(
    private readonly clanService: ClanService,
    private readonly clanGateway: ClanGateway,
  ) {}

  // ========================================
  // Clan CRUD
  // ========================================

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createClan(
    @CurrentUser("sub") userId: string,
    @Body() dto: CreateClanDto,
  ) {
    return this.clanService.createClan(userId, dto);
  }

  @Get()
  @Public()
  async listClans(
    @Query("search") search?: string,
    @Query("isRecruiting") isRecruiting?: string,
    @Query("minTier") minTier?: string,
    @Query("sort") sort?: string,
  ) {
    return this.clanService.listClans({
      search,
      isRecruiting: isRecruiting === "true",
      minTier,
      sort,
    });
  }

  // /clans/my 로 통일 (api-client 기준)
  @Get("my")
  async getMyClan(@CurrentUser("sub") userId: string) {
    return this.clanService.getUserClan(userId);
  }

  @Get(":id")
  @Public()
  async getClan(@Param("id") id: string) {
    return this.clanService.getClanById(id);
  }

  @Get(":id/stats")
  @Public()
  async getClanStats(@Param("id") clanId: string) {
    return this.clanService.getClanStats(clanId);
  }

  // 부분 업데이트이므로 Patch 사용
  @Patch(":id")
  async updateClan(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Body() dto: UpdateClanDto,
  ) {
    const result = await this.clanService.updateClan(userId, clanId, dto);

    // Broadcast clan update to all members
    this.clanGateway.emitClanUpdated(clanId, result);

    return result;
  }

  @Delete(":id")
  async deleteClan(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
  ) {
    const result = await this.clanService.deleteClan(userId, clanId);

    // Broadcast clan deletion to all members
    this.clanGateway.emitClanDeleted(clanId);

    return result;
  }

  // ========================================
  // Member Management
  // ========================================

  @Post(":id/join")
  @HttpCode(HttpStatus.OK)
  async joinClan(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
  ) {
    const membership = await this.clanService.joinClan(userId, clanId);

    // Broadcast new member to all clan members
    this.clanGateway.emitMemberJoined(clanId, { user: membership.user });

    return membership;
  }

  @Post(":id/leave")
  @HttpCode(HttpStatus.OK)
  async leaveClan(
    @CurrentUser("sub") userId: string,
    @CurrentUser("username") username: string,
    @Param("id") clanId: string,
  ) {
    const result = await this.clanService.leaveClan(userId, clanId);

    // Broadcast member left to all clan members
    this.clanGateway.emitMemberLeft(clanId, { userId, username });

    return result;
  }

  @Delete(":id/members/:memberId")
  async kickMember(
    @CurrentUser("sub") userId: string,
    @CurrentUser("username") kickerUsername: string,
    @Param("id") clanId: string,
    @Param("memberId") memberId: string,
  ) {
    const result = await this.clanService.kickMember(userId, clanId, memberId);

    // Broadcast member kicked to all clan members
    this.clanGateway.emitMemberKicked(clanId, {
      userId: memberId,
      username: result.kickedUser?.username || "Unknown",
      kickedBy: kickerUsername,
    });

    return result;
  }

  // 부분 업데이트이므로 Patch 사용
  @Patch(":id/members/:memberId/role")
  async promoteMember(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Param("memberId") memberId: string,
    @Body() body: UpdateMemberRoleDto,
  ) {
    const result = await this.clanService.promoteMember(
      userId,
      clanId,
      memberId,
      body.role,
    );

    // Broadcast member promotion to all clan members
    this.clanGateway.emitMemberPromoted(clanId, {
      userId: memberId,
      username: result.promotedUser?.username || "Unknown",
      newRole: body.role,
    });

    return result;
  }

  @Post(":id/transfer-ownership")
  @HttpCode(HttpStatus.OK)
  async transferOwnership(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Body() body: TransferOwnershipDto,
  ) {
    const result = await this.clanService.transferOwnership(
      userId,
      clanId,
      body.newOwnerId,
    );

    // Broadcast ownership transfer to all clan members
    this.clanGateway.emitOwnershipTransferred(clanId, {
      oldOwnerId: userId,
      newOwnerId: body.newOwnerId,
    });

    return result;
  }

  // ========================================
  // Clan Chat
  // ========================================

  @Get(":id/messages")
  async getChatMessages(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.clanService.getChatMessages(
      userId,
      clanId,
      cursor,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Delete(":id/messages/:messageId")
  @HttpCode(HttpStatus.OK)
  async deleteChatMessage(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Param("messageId") messageId: string,
  ) {
    const result = await this.clanService.deleteChatMessage(
      userId,
      clanId,
      messageId,
    );

    // 메시지 삭제 이벤트 브로드캐스트
    this.clanGateway.emitMessageDeleted(clanId, messageId);

    return result;
  }

  // ========================================
  // Announcement
  // ========================================

  @Post(":id/announcements")
  @HttpCode(HttpStatus.CREATED)
  async createAnnouncement(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Body() body: ContentDto,
  ) {
    const announcement = await this.clanService.createAnnouncement(
      userId,
      clanId,
      body.content,
    );

    // 공지 생성 이벤트 브로드캐스트
    this.clanGateway.emitAnnouncementCreated(clanId, announcement);

    return announcement;
  }

  @Get(":id/announcements")
  async getAnnouncements(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
  ) {
    return this.clanService.getAnnouncements(userId, clanId);
  }

  @Delete(":id/announcements/:announcementId")
  @HttpCode(HttpStatus.OK)
  async deleteAnnouncement(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Param("announcementId") announcementId: string,
  ) {
    const result = await this.clanService.deleteAnnouncement(
      userId,
      clanId,
      announcementId,
    );

    this.clanGateway.emitAnnouncementDeleted(clanId, announcementId);

    return result;
  }

  @Patch(":id/announcements/:announcementId/unpin")
  @HttpCode(HttpStatus.OK)
  async unpinAnnouncement(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Param("announcementId") announcementId: string,
  ) {
    return this.clanService.unpinAnnouncement(userId, clanId, announcementId);
  }

  // ========================================
  // Invitation & Join Request
  // ========================================

  // 내가 받은 초대 목록
  @Get("invitations/my")
  async getMyInvitations(@CurrentUser("sub") userId: string) {
    return this.clanService.getPendingInvitations(userId);
  }

  // 초대 코드로 가입
  @Post("join-by-code")
  @HttpCode(HttpStatus.OK)
  async joinByCode(
    @CurrentUser("sub") userId: string,
    @Body() body: JoinByCodeDto,
  ) {
    const membership = await this.clanService.joinByCode(userId, body.code);
    if (membership) {
      this.clanGateway.emitMemberJoined(membership.clanId, {
        user: membership.user,
      });
    }
    return membership;
  }

  // 초대 코드 생성
  @Post(":id/invite-code")
  @HttpCode(HttpStatus.CREATED)
  async generateInviteCode(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
  ) {
    return this.clanService.generateInviteCode(userId, clanId);
  }

  // 유저 직접 초대
  @Post(":id/invite")
  @HttpCode(HttpStatus.CREATED)
  async inviteUser(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Body() body: InviteUserDto,
  ) {
    return this.clanService.inviteUser(userId, clanId, body.inviteeId);
  }

  // 가입 요청 보내기
  @Post(":id/request-join")
  @HttpCode(HttpStatus.CREATED)
  async requestToJoin(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
  ) {
    return this.clanService.requestToJoin(userId, clanId);
  }

  // 내 초대 수락/거절
  @Post("invitations/:invitationId/resolve")
  @HttpCode(HttpStatus.OK)
  async resolveInvitation(
    @CurrentUser("sub") userId: string,
    @Param("invitationId") invitationId: string,
    @Body() body: ResolveDto,
  ) {
    const result = await this.clanService.resolveInvitation(
      userId,
      invitationId,
      body.accept,
    );

    if (result.accepted) {
      // 가입 완료 시 브로드캐스트는 생략 (서버에서 처리)
    }

    return result;
  }

  // 가입 요청 목록 조회 (OWNER/OFFICER)
  @Get(":id/join-requests")
  async getPendingJoinRequests(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
  ) {
    return this.clanService.getPendingJoinRequests(userId, clanId);
  }

  // 가입 요청 승인/거절 (OWNER/OFFICER)
  @Post(":id/join-requests/:requestId/resolve")
  @HttpCode(HttpStatus.OK)
  async resolveJoinRequest(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Param("requestId") requestId: string,
    @Body() body: ResolveDto,
  ) {
    return this.clanService.resolveJoinRequest(
      userId,
      clanId,
      requestId,
      body.accept,
    );
  }

  // ========================================
  // Activity Log
  // ========================================

  @Get(":id/activity-logs")
  async getActivityLogs(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.clanService.getActivityLogs(
      userId,
      clanId,
      cursor,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post(":id/messages")
  @HttpCode(HttpStatus.CREATED)
  async sendChatMessage(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Body() body: ContentDto,
  ) {
    const message = await this.clanService.sendChatMessage(
      userId,
      clanId,
      body.content,
    );

    // Message is already broadcast by gateway via send-clan-message event
    // This endpoint is for HTTP API access

    return message;
  }
}
