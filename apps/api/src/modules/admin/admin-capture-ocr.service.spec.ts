import { AdminCaptureOcrService } from "./admin-capture-ocr.service";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp");

/** 테스트용 캡처 — 실제 PNG 여야 sharp 리사이즈를 통과한다 */
async function pngFile(width = 64, height = 32): Promise<Express.Multer.File> {
  const buffer: Buffer = await sharp({
    create: { width, height, channels: 3, background: "#000" },
  })
    .png()
    .toBuffer();
  return { buffer, mimetype: "image/png" } as Express.Multer.File;
}

const SCOREBOARD = {
  durationText: "31:02",
  teams: [
    {
      result: "WIN",
      players: [
        {
          riotId: "하루#KR1",
          champion: "아리",
          kills: 5,
          deaths: 2,
          assists: 10,
          cs: 210,
          gold: 12300,
        },
      ],
    },
  ],
};

/** 끝날 때까지 작업을 폴링한다 (fetch 목은 즉시 응답하므로 몇 틱이면 끝난다) */
async function waitJob(service: AdminCaptureOcrService, id: string) {
  for (let i = 0; i < 50; i++) {
    const job = service.getJob(id);
    if (job.status !== "running") return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("작업이 끝나지 않았다");
}

describe("AdminCaptureOcrService", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.OLLAMA_BASE_URL = "http://ollama.test:11434/";
    delete process.env.CAPTURE_OCR_MODEL;
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it("OLLAMA_BASE_URL 이 없으면 꺼진 상태를 알리고 Ollama 를 부르지 않는다", async () => {
    delete process.env.OLLAMA_BASE_URL;
    const status = await new AdminCaptureOcrService().getStatus();
    expect(status.enabled).toBe(false);
    expect(status.reachable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("상태: 버전과 설치된 모델 목록을 돌려준다", async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith("/api/version")
          ? { version: "0.40.5" }
          : {
              models: [{ name: "qwen2.5vl:7b", size: 6 * 1024 * 1024 * 1024 }],
            },
    }));

    const status = await new AdminCaptureOcrService().getStatus();

    expect(status).toMatchObject({
      enabled: true,
      reachable: true,
      version: "0.40.5",
      defaultModel: "qwen2.5vl:7b",
      models: [{ name: "qwen2.5vl:7b", sizeMb: 6144 }],
    });
    // 끝의 / 는 잘라서 붙인다
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ollama.test:11434/api/version",
      expect.anything(),
    );
  });

  it("상태: 연결이 안 되면 reachable=false 와 사유를 준다", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const status = await new AdminCaptureOcrService().getStatus();
    expect(status.reachable).toBe(false);
    expect(status.error).toContain("ECONNREFUSED");
  });

  it("분석: 작업 ID 를 바로 주고, 끝나면 파싱한 점수판과 속도를 채운다", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: JSON.stringify(SCOREBOARD) },
        prompt_eval_count: 2600,
        prompt_eval_duration: 8_000_000_000,
        eval_count: 400,
        eval_duration: 12_000_000_000,
      }),
    });
    const service = new AdminCaptureOcrService();

    const { jobId } = await service.startAnalysis(
      await pngFile(),
      "qwen3-vl:4b",
    );
    const job = await waitJob(service, jobId);

    expect(job.status).toBe("done");
    expect(job.result).toMatchObject({
      model: "qwen3-vl:4b",
      promptTokens: 2600,
      promptMs: 8000,
      evalTokens: 400,
      evalMs: 12000,
      imageWidth: 64,
      imageHeight: 32,
      parsed: SCOREBOARD,
    });

    // 스키마 강제·결정적 출력·이미지 첨부로 호출한다
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("qwen3-vl:4b");
    expect(body.format.required).toEqual(["teams"]);
    expect(body.options.temperature).toBe(0);
    expect(body.messages[0].images).toHaveLength(1);
  });

  it("분석: 큰 캡처는 긴 변을 1920 으로 줄여 보낸다", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "{}" } }),
    });
    const service = new AdminCaptureOcrService();

    const { jobId } = await service.startAnalysis(await pngFile(3840, 2160));
    const job = await waitJob(service, jobId);

    expect(job.result).toMatchObject({ imageWidth: 1920, imageHeight: 1080 });
  });

  it("분석: 모델이 깨진 JSON 을 주면 parsed=null 이고 원문은 남긴다", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "{teams: 깨짐" } }),
    });
    const service = new AdminCaptureOcrService();

    const { jobId } = await service.startAnalysis(await pngFile());
    const job = await waitJob(service, jobId);

    expect(job.status).toBe("done");
    expect(job.result?.parsed).toBeNull();
    expect(job.result?.raw).toBe("{teams: 깨짐");
  });

  it("분석: Ollama 가 에러를 주면 작업이 error 로 끝나고 다음 분석을 막지 않는다", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'model "nope" not found',
    });
    const service = new AdminCaptureOcrService();

    const first = await service.startAnalysis(await pngFile(), "nope");
    const job = await waitJob(service, first.jobId);
    expect(job.status).toBe("error");
    expect(job.error).toContain("404");

    // busy 가 풀려 다음 분석을 시작할 수 있다
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "{}" } }),
    });
    await expect(
      service.startAnalysis(await pngFile()),
    ).resolves.toHaveProperty("jobId");
  });

  it("분석 중에 또 올리면 409 로 막는다 (GPU 는 한 장씩)", async () => {
    // 응답을 붙잡아 둔다
    let release!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => (release = r)));
    const service = new AdminCaptureOcrService();

    const { jobId } = await service.startAnalysis(await pngFile());
    await expect(service.startAnalysis(await pngFile())).rejects.toMatchObject({
      status: 409,
    });

    release({ ok: true, json: async () => ({ message: { content: "{}" } }) });
    await waitJob(service, jobId);
  });

  it("이미지가 아니거나 비어 있으면 400, 기능이 꺼져 있으면 503", async () => {
    const service = new AdminCaptureOcrService();
    await expect(service.startAnalysis(undefined)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.startAnalysis({
        buffer: Buffer.from("x"),
        mimetype: "text/plain",
      } as Express.Multer.File),
    ).rejects.toMatchObject({ status: 400 });

    delete process.env.OLLAMA_BASE_URL;
    await expect(service.startAnalysis(await pngFile())).rejects.toMatchObject({
      status: 503,
    });
  });

  it("없는 작업 ID 는 404", () => {
    expect(() => new AdminCaptureOcrService().getJob("nope")).toThrow(
      expect.objectContaining({ status: 404 }),
    );
  });
});
