import {
  Controller,
  Get,
  Post,
  Put,
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
import { ClanService, CreateClanDto, UpdateClanDto } from "./clan.service";
import { ClanGateway } from "./clan.gateway";
import { ClanRole } from "@nexus/database";

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
  ) {
    return this.clanService.listClans({
      search,
      isRecruiting: isRecruiting === "true",
      minTier,
    });
  }

  @Get("my-clan")
  async getMyClan(@CurrentUser("sub") userId: string) {
    return this.clanService.getUserClan(userId);
  }

  @Get(":id")
  @Public()
  async getClan(@Param("id") id: string) {
    return this.clanService.getClanById(id);
  }

  @Put(":id")
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
    const result = await this.clanService.kickMember(
      userId,
      clanId,
      memberId,
    );

    // Broadcast member kicked to all clan members
    this.clanGateway.emitMemberKicked(clanId, {
      userId: memberId,
      username: "User", // TODO: get actual username
      kickedBy: kickerUsername,
    });

    return result;
  }

  @Put(":id/members/:memberId/role")
  async promoteMember(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Param("memberId") memberId: string,
    @Body() body: { role: ClanRole },
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
      username: "User", // TODO: get actual username
      newRole: body.role,
    });

    return result;
  }

  @Post(":id/transfer-ownership")
  @HttpCode(HttpStatus.OK)
  async transferOwnership(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Body() body: { newOwnerId: string },
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
    @Query("limit") limit?: string,
  ) {
    return this.clanService.getChatMessages(
      userId,
      clanId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post(":id/messages")
  @HttpCode(HttpStatus.CREATED)
  async sendChatMessage(
    @CurrentUser("sub") userId: string,
    @Param("id") clanId: string,
    @Body() body: { content: string },
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
