import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RegisterPubgAccountDto, UpdatePubgScoreDto } from "./dto";
import { PubgService } from "./pubg.service";

@Controller("pubg")
@UseGuards(JwtAuthGuard)
export class PubgController {
  constructor(private readonly pubgService: PubgService) {}

  @Get("accounts")
  getAccounts(@CurrentUser("sub") userId: string) {
    return this.pubgService.getAccounts(userId);
  }

  @Post("accounts")
  @HttpCode(HttpStatus.CREATED)
  registerAccount(
    @CurrentUser("sub") userId: string,
    @Body() dto: RegisterPubgAccountDto,
  ) {
    return this.pubgService.registerAccount(userId, dto);
  }

  @Delete("accounts/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(
    @CurrentUser("sub") userId: string,
    @Param("id") accountId: string,
  ) {
    await this.pubgService.deleteAccount(userId, accountId);
  }

  @Patch("accounts/:id/score")
  updateScore(
    @CurrentUser("sub") userId: string,
    @Param("id") accountId: string,
    @Body() dto: UpdatePubgScoreDto,
  ) {
    return this.pubgService.updateScore(userId, accountId, dto);
  }
}
