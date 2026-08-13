import { StreamerController } from "./streamer.controller";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";

describe("StreamerController", () => {
  const chzzkOAuth = {
    createAuthorizationUrl: jest.fn(),
  };

  const controller = new StreamerController(
    {} as never,
    {} as never,
    chzzkOAuth as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reads the user id from the JWT subject", () => {
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      StreamerController,
      "startChzzkOAuth",
    ) as Record<string, { data?: string }>;

    expect(Object.values(metadata).some(({ data }) => data === "sub")).toBe(
      true,
    );
  });

  it("binds the CHZZK OAuth state to the authenticated user id", async () => {
    chzzkOAuth.createAuthorizationUrl.mockResolvedValue({
      url: "https://chzzk.naver.com/account-interlock",
    });

    await controller.startChzzkOAuth("user-1");

    expect(chzzkOAuth.createAuthorizationUrl).toHaveBeenCalledWith("user-1");
  });
});
