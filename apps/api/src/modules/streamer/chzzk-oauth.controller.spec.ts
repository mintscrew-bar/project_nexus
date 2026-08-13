import type { Response } from "express";
import { PATH_METADATA } from "@nestjs/common/constants";
import { ChzzkOAuthController } from "./chzzk-oauth.controller";
import { ChzzkOAuthService } from "./chzzk-oauth.service";

describe("ChzzkOAuthController", () => {
  const chzzkOAuth = {
    completeAuthorization: jest.fn(),
    getSettingsRedirect: jest.fn(
      (result: "success" | "error") =>
        `https://example.com/settings?tab=broadcast&chzzk_oauth=${result}`,
    ),
  };
  const response = {
    redirect: jest.fn(),
  } as unknown as Response;
  let controller: ChzzkOAuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ChzzkOAuthController(
      chzzkOAuth as unknown as ChzzkOAuthService,
    );
  });

  it("registers the callback at the configured CHZZK redirect path", () => {
    expect(Reflect.getMetadata(PATH_METADATA, ChzzkOAuthController)).toBe(
      "auth/chzzk",
    );
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        ChzzkOAuthController.prototype.callback,
      ),
    ).toBe("callback");
  });

  it("completes authorization and redirects to the success result", async () => {
    chzzkOAuth.completeAuthorization.mockResolvedValue({ id: "profile-1" });

    await controller.callback("code", "state", response);

    expect(chzzkOAuth.completeAuthorization).toHaveBeenCalledWith(
      "code",
      "state",
    );
    expect(response.redirect).toHaveBeenCalledWith(
      "https://example.com/settings?tab=broadcast&chzzk_oauth=success",
    );
  });

  it("redirects to the error result when authorization fails", async () => {
    chzzkOAuth.completeAuthorization.mockRejectedValue(new Error("expired"));

    await controller.callback("code", "state", response);

    expect(response.redirect).toHaveBeenCalledWith(
      "https://example.com/settings?tab=broadcast&chzzk_oauth=error",
    );
  });
});
