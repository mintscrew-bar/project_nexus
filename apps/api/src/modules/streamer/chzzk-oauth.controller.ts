import { Controller, Get, Query, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { ChzzkOAuthService } from "./chzzk-oauth.service";

@Controller("auth/chzzk")
export class ChzzkOAuthController {
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
    } catch {
      return response.redirect(this.chzzkOAuth.getSettingsRedirect("error"));
    }
  }
}
