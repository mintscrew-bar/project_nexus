import { Controller, Get, Logger, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { ChzzkOAuthService } from "./chzzk-oauth.service";

@Controller("auth/chzzk")
export class ChzzkOAuthController {
  private readonly logger = new Logger(ChzzkOAuthController.name);

  constructor(private readonly chzzkOAuth: ChzzkOAuthService) {}

  @Get("callback")
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() response: Response,
  ) {
    try {
      await this.chzzkOAuth.completeAuthorization(code, state);
      return response.redirect(this.chzzkOAuth.getSettingsRedirect("success"));
    } catch (error) {
      this.logger.warn(
        `치지직 OAuth 콜백 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return response.redirect(this.chzzkOAuth.getSettingsRedirect("error"));
    }
  }
}
