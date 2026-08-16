import { StreamerController } from "./streamer.controller";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";

describe("StreamerController", () => {
  const chzzkOAuth = {
    createAuthorizationUrl: jest.fn(),
  };
  const verificationService = {
    issueCode: jest.fn(),
    confirm: jest.fn(),
  };

  const controller = new StreamerController(
    {} as never,
    verificationService as never,
    chzzkOAuth as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads the user id from the JWT subject", () => {
    for (const method of ["issueCode", "confirm", "startChzzkOAuth"]) {
      const metadata = Reflect.getMetadata(
        ROUTE_ARGS_METADATA,
        StreamerController,
        method,
      ) as Record<string, { data?: string }>;

      expect(Object.values(metadata).some(({ data }) => data === "sub")).toBe(
        true,
      );
    }
  });

  it("passes the authenticated user id to channel verification", async () => {
    verificationService.issueCode.mockResolvedValue({ code: "NEXUS-1234" });
    verificationService.confirm.mockResolvedValue({ verified: true });

    await controller.issueCode("user-1", { platform: "SOOP" } as never);
    await controller.confirm("user-1", { platform: "SOOP" } as never);

    expect(verificationService.issueCode).toHaveBeenCalledWith(
      "user-1",
      "SOOP",
    );
    expect(verificationService.confirm).toHaveBeenCalledWith("user-1", "SOOP");
  });

  it("binds the CHZZK OAuth state to the authenticated user id", async () => {
    chzzkOAuth.createAuthorizationUrl.mockResolvedValue({
      url: "https://chzzk.naver.com/account-interlock",
    });

    await controller.startChzzkOAuth("user-1");

    expect(chzzkOAuth.createAuthorizationUrl).toHaveBeenCalledWith("user-1");
  });
});
