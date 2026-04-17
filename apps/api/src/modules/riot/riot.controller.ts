import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Public } from "../auth/decorators/public.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { RiotService } from "./riot.service";
import { RegisterRiotAccountDto } from "./dto";
import { DataDragonService } from "./data-dragon.service";
import { RiotTournamentService } from "./riot-tournament.service";
import { RiotSpectatorService } from "./riot-spectator.service";
import { Role, UserRole } from "@nexus/database";

@Controller("riot")
export class RiotController {
  constructor(
    private readonly riotService: RiotService,
    private readonly dataDragonService: DataDragonService,
    private readonly tournamentService: RiotTournamentService,
    private readonly spectatorService: RiotSpectatorService,
  ) {}

  // ========================================
  // Verification & Registration
  // ========================================

  @Post("verify/start")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async startVerification(
    @CurrentUser("sub") userId: string,
    @Body() data: { gameName: string; tagLine: string },
  ) {
    return this.riotService.startVerification(
      userId,
      data.gameName,
      data.tagLine,
    );
  }

  @Get("verify/check")
  @UseGuards(JwtAuthGuard)
  async checkVerification(@CurrentUser("sub") userId: string) {
    return this.riotService.checkVerification(userId);
  }

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  async registerAccount(
    @CurrentUser("sub") userId: string,
    @Body() dto: RegisterRiotAccountDto,
  ) {
    return this.riotService.registerRiotAccount(userId, dto);
  }

  // ========================================
  // Account Management
  // ========================================

  @Get("accounts")
  @UseGuards(JwtAuthGuard)
  async getMyAccounts(@CurrentUser("sub") userId: string) {
    return this.riotService.getUserRiotAccounts(userId);
  }

  @Put("accounts/:id/primary")
  @UseGuards(JwtAuthGuard)
  async setPrimaryAccount(
    @CurrentUser("sub") userId: string,
    @Param("id") accountId: string,
  ) {
    return this.riotService.setPrimaryAccount(userId, accountId);
  }

  @Post("accounts/:id/sync")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async syncAccount(
    @CurrentUser("sub") userId: string,
    @Param("id") id: string,
  ) {
    return this.riotService.syncRankedInfo(userId, id);
  }

  @Delete("accounts/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @CurrentUser("sub") userId: string,
    @Param("id") accountId: string,
  ) {
    return this.riotService.deleteRiotAccount(userId, accountId);
  }

  @Put("accounts/:id")
  @UseGuards(JwtAuthGuard)
  async updateAccount(
    @CurrentUser("sub") userId: string,
    @Param("id") accountId: string,
    @Body()
    dto: {
      mainRole: string;
      subRole: string;
      peakTier?: string;
      peakRank?: string;
      championsByRole?: Record<string, string[]>;
    },
  ) {
    return this.riotService.updateRiotAccountInfo(
      userId,
      accountId,
      dto as any,
    );
  }

  @Put("accounts/:id/champions/:role")
  @UseGuards(JwtAuthGuard)
  async updateChampions(
    @CurrentUser("sub") userId: string,
    @Param("id") accountId: string,
    @Param("role") role: Role,
    @Body() body: { championIds: string[] },
  ) {
    return this.riotService.updateChampionPreferences(
      userId,
      accountId,
      role,
      body.championIds,
    );
  }

  @Get("summoner/:gameName/:tagLine")
  @Public() // 임시로 인증 제거 (테스트용)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getSummoner(
    @Param("gameName") gameName: string,
    @Param("tagLine") tagLine: string,
  ) {
    return this.riotService.getSummonerByRiotId(gameName, tagLine);
  }

  // ============================================
  // Data Dragon Endpoints (Public)
  // ============================================

  @Get("ddragon/version")
  @Public()
  async getDataDragonVersion() {
    const version = await this.dataDragonService.getLatestVersion();
    return { version };
  }

  @Get("ddragon/champions")
  @Public()
  async getChampions(@Query("locale") locale?: string) {
    const data = await this.dataDragonService.getChampionData(
      locale || "ko_KR",
    );
    const version = await this.dataDragonService.getLatestVersion();
    return { version, data };
  }

  @Get("ddragon/items")
  @Public()
  async getItems(@Query("locale") locale?: string) {
    const data = await this.dataDragonService.getItemData(locale || "ko_KR");
    const version = await this.dataDragonService.getLatestVersion();
    return { version, data };
  }

  @Get("ddragon/champion/:key/image")
  @Public()
  async getChampionImage(
    @Param("key") key: string,
    @Query("type") type?: "square" | "splash" | "loading",
  ) {
    const url = await this.dataDragonService.getChampionImageUrl(
      key,
      type || "square",
    );
    return { url, championKey: key, type: type || "square" };
  }

  @Get("ddragon/item/:id/image")
  @Public()
  async getItemImage(@Param("id") id: string) {
    const url = await this.dataDragonService.getItemImageUrl(id);
    return { url, itemId: id };
  }

  @Get("ddragon/spell/:key/image")
  @Public()
  async getSpellImage(@Param("key") key: string) {
    const url = await this.dataDragonService.getSpellImageUrl(key);
    return { url, spellKey: key };
  }

  @Get("ddragon/profile-icon/:id/image")
  @Public()
  async getProfileIconImage(@Param("id") id: string) {
    const iconId = parseInt(id, 10);
    if (isNaN(iconId)) {
      throw new Error("Invalid profile icon ID");
    }
    const url = await this.dataDragonService.getProfileIconUrl(iconId);
    return { url, iconId };
  }

  // ============================================
  // Tournament API (Admin Only)
  // ============================================

  @Post("tournament/provider/create")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createProvider() {
    return this.tournamentService.createProviderManually();
  }

  @Post("tournament/create")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async createTournament(@Body() data: { providerId: string }) {
    return this.tournamentService.createTournamentManually(data.providerId);
  }

  // ============================================
  // Spectator (라이브 게임)
  // ============================================

  @Get("summoner/:gameName/:tagLine/live")
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getLiveGame(
    @Param("gameName") gameName: string,
    @Param("tagLine") tagLine: string,
  ) {
    // puuid 조회 후 라이브 게임 확인
    const summoner = await this.riotService.getSummonerByRiotId(
      gameName,
      tagLine,
    );
    if (!summoner?.puuid) return { isLive: false };
    const gameInfo = await this.spectatorService.getActiveGameByPUUID(
      summoner.puuid,
    );
    if (!gameInfo) return { isLive: false };
    return { isLive: true, gameInfo };
  }
}
