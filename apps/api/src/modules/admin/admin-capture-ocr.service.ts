import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Sharp, SharpOptions } from "sharp";

// tsconfig 에 esModuleInterop 이 없어 `import sharp from "sharp"` 는 런타임에 undefined 가 된다.
// upload.service.ts 와 같은 방식으로 런타임 실체를 require 하고 타입만 붙인다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp") as (
  input?: Buffer,
  options?: SharpOptions,
) => Sharp;

/**
 * 결과창 캡처 인식 실험 (ADMIN 전용).
 *
 * 토너먼트 코드 없이 연 내전은 Riot 이 개인 기록(챔피언·KDA·CS·골드)을 주지 않는다.
 * 그 빈칸을 "게임 종료 후 결과창 캡처 → 로컬 비전 모델 인식"으로 채울 수 있는지
 * 정확도·속도를 재 보는 실험용 경로다. DB 에는 아무것도 저장하지 않는다.
 *
 * 인식은 운영 호스트에 띄운 Ollama(GPU)가 한다. 외부 유료 API 를 쓰지 않으므로
 * 비용·한도가 없고 캡처가 밖으로 나가지 않는다.
 *
 * 환경변수
 * - OLLAMA_BASE_URL   : 예) http://host.docker.internal:11434 — 비어 있으면 기능 꺼짐
 * - CAPTURE_OCR_MODEL : 기본 모델 (기본값 qwen2.5vl:7b)
 */

// 결과창 점수판에서 뽑을 구조 — Ollama structured output 으로 이 모양을 강제한다
const PLAYER_SCHEMA = {
  type: "object",
  properties: {
    riotId: { type: "string" },
    champion: { type: "string" },
    level: { type: "integer" },
    kills: { type: "integer" },
    deaths: { type: "integer" },
    assists: { type: "integer" },
    cs: { type: "integer" },
    gold: { type: "integer" },
  },
  required: ["riotId", "champion", "kills", "deaths", "assists", "cs", "gold"],
} as const;

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    durationText: { type: "string" },
    teams: {
      type: "array",
      items: {
        type: "object",
        properties: {
          result: { type: "string", enum: ["WIN", "LOSS", "UNKNOWN"] },
          players: { type: "array", items: PLAYER_SCHEMA },
        },
        required: ["result", "players"],
      },
    },
  },
  required: ["teams"],
} as const;

const PROMPT = [
  "이 이미지는 리그 오브 레전드 게임 종료 후 결과창(점수판)이다.",
  "두 팀(위쪽 팀, 아래쪽 팀) 순서대로, 각 팀의 승리/패배와 플레이어 5명의",
  "라이엇 ID(닉네임#태그, 보이는 그대로), 챔피언 이름(한국어), 레벨, 킬/데스/어시스트,",
  "CS(미니언 처치 수), 골드를 읽어라. 골드가 12.3k 처럼 보이면 12300 으로 적어라.",
  "보이지 않는 값은 지어내지 말고 0 또는 빈 문자열로 둔다. 게임 시간도 보이면 적어라.",
].join(" ");

// 1080p 한 장이 이미지 토큰만 ~2,600개다. 그보다 큰 캡처(1440p·4K)는 VRAM 8GB 를
// 넘길 수 있어 긴 변을 이 값으로 줄인다. 점수판 글자는 이 크기에서도 읽힌다.
const MAX_IMAGE_EDGE = 1920;
// GTX 1080 기준 한 장 20~60초 예상. 모델을 처음 올리는 시간까지 넉넉히 잡는다.
const ANALYZE_TIMEOUT_MS = 5 * 60 * 1000;
const STATUS_TIMEOUT_MS = 3000;
// 메모리에 남겨 둘 최근 분석 작업 수
const MAX_KEPT_JOBS = 20;

export interface CaptureOcrStatus {
  enabled: boolean;
  reachable: boolean;
  version: string | null;
  defaultModel: string;
  models: { name: string; sizeMb: number }[];
  error?: string;
}

export interface CaptureOcrResult {
  model: string;
  tookMs: number;
  promptTokens: number | null;
  promptMs: number | null;
  evalTokens: number | null;
  evalMs: number | null;
  imageWidth: number;
  imageHeight: number;
  parsed: unknown;
  raw: string;
}

export interface CaptureOcrJob {
  id: string;
  status: "running" | "done" | "error";
  model: string;
  startedAt: number;
  finishedAt?: number;
  result?: CaptureOcrResult;
  error?: string;
}

@Injectable()
export class AdminCaptureOcrService {
  private readonly logger = new Logger(AdminCaptureOcrService.name);
  // GPU 는 한 장씩만 처리한다. 동시에 두 장을 올리면 VRAM 이 넘치거나 둘 다 느려진다.
  private busy = false;
  private readonly jobs = new Map<string, CaptureOcrJob>();

  private get baseUrl(): string | null {
    const url = process.env.OLLAMA_BASE_URL?.trim();
    return url ? url.replace(/\/+$/, "") : null;
  }

  private get defaultModel(): string {
    return process.env.CAPTURE_OCR_MODEL?.trim() || "qwen2.5vl:7b";
  }

  /** Ollama 연결 상태와 설치된 모델 목록 */
  async getStatus(): Promise<CaptureOcrStatus> {
    const base = this.baseUrl;
    const status: CaptureOcrStatus = {
      enabled: !!base,
      reachable: false,
      version: null,
      defaultModel: this.defaultModel,
      models: [],
    };
    if (!base) {
      status.error = "OLLAMA_BASE_URL 이 설정되지 않았습니다.";
      return status;
    }

    try {
      const [version, tags] = await Promise.all([
        this.getJson<{ version: string }>(`${base}/api/version`),
        this.getJson<{ models?: { name: string; size: number }[] }>(
          `${base}/api/tags`,
        ),
      ]);
      status.reachable = true;
      status.version = version.version;
      status.models = (tags.models ?? []).map((m) => ({
        name: m.name,
        sizeMb: Math.round(m.size / 1024 / 1024),
      }));
    } catch (error) {
      status.error = `Ollama 에 연결하지 못했습니다: ${(error as Error).message}`;
    }
    return status;
  }

  /**
   * 캡처 분석을 시작하고 작업 ID 를 바로 돌려준다.
   *
   * 분석이 수십 초~수 분 걸리는데 Cloudflare 는 응답을 100초까지만 기다린다(524).
   * 그래서 요청은 즉시 끝내고, 화면이 작업 ID 로 결과를 폴링한다.
   * API 는 PM2 fork 1개라 작업 목록을 메모리에 둬도 된다(재시작하면 사라짐 — 실험용).
   */
  async startAnalysis(
    file: Express.Multer.File | undefined,
    requestedModel?: string,
  ): Promise<{ jobId: string }> {
    const base = this.baseUrl;
    if (!base) {
      throw new ServiceUnavailableException(
        "OLLAMA_BASE_URL 이 설정되지 않아 캡처 인식을 쓸 수 없습니다.",
      );
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException("캡처 이미지를 올려주세요.");
    }
    if (!file.mimetype?.startsWith("image/")) {
      throw new BadRequestException("이미지 파일만 올릴 수 있습니다.");
    }
    if (this.busy) {
      throw new ConflictException(
        "다른 캡처를 분석하는 중입니다. 끝난 뒤 다시 시도하세요.",
      );
    }

    const model = requestedModel?.trim() || this.defaultModel;
    const job: CaptureOcrJob = {
      id: randomUUID(),
      status: "running",
      model,
      startedAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    this.pruneJobs();

    this.busy = true;
    // 응답을 기다리지 않는다 — 결과는 job 에 채워지고 getJob 으로 가져간다
    void this.run(base, model, file.buffer)
      .then((result) => {
        job.status = "done";
        job.result = result;
      })
      .catch((error: unknown) => {
        job.status = "error";
        job.error =
          error instanceof Error && error.name === "TimeoutError"
            ? "모델 응답이 5분 안에 오지 않았습니다."
            : error instanceof Error
              ? error.message
              : String(error);
        this.logger.warn(`캡처 인식 실패 ${model}: ${job.error}`);
      })
      .finally(() => {
        job.finishedAt = Date.now();
        this.busy = false;
      });

    return { jobId: job.id };
  }

  /** 분석 작업 상태 (진행 중이면 경과 시간만, 끝났으면 결과까지) */
  getJob(id: string): CaptureOcrJob & { elapsedMs: number } {
    const job = this.jobs.get(id);
    if (!job) {
      throw new NotFoundException(
        "분석 작업을 찾을 수 없습니다. 서버가 재시작됐을 수 있습니다.",
      );
    }
    return {
      ...job,
      elapsedMs: (job.finishedAt ?? Date.now()) - job.startedAt,
    };
  }

  // 오래된 작업은 버린다 — 결과 JSON 이 쌓여 메모리를 잡아먹지 않게
  private pruneJobs() {
    while (this.jobs.size > MAX_KEPT_JOBS) {
      const oldest = this.jobs.keys().next().value;
      if (oldest === undefined) break;
      this.jobs.delete(oldest);
    }
  }

  /** 캡처 한 장을 비전 모델로 읽어 점수판 JSON 을 돌려준다 */
  private async run(
    base: string,
    model: string,
    buffer: Buffer,
  ): Promise<CaptureOcrResult> {
    // 큰 캡처는 줄이고 PNG 로 통일한다 (회전 정보도 이때 반영)
    const { data: image, info } = await sharp(buffer)
      .rotate()
      .resize({
        width: MAX_IMAGE_EDGE,
        height: MAX_IMAGE_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer({ resolveWithObject: true });

    const started = Date.now();
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(ANALYZE_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: PROMPT,
            images: [image.toString("base64")],
          },
        ],
        format: RESULT_SCHEMA,
        stream: false,
        // 같은 캡처는 같은 결과가 나와야 모델끼리 비교가 된다
        options: { temperature: 0, num_ctx: 8192 },
      }),
    });
    const tookMs = Date.now() - started;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`모델 호출 실패 (${res.status}): ${text.slice(0, 300)}`);
    }

    const body = (await res.json()) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      prompt_eval_duration?: number;
      eval_count?: number;
      eval_duration?: number;
    };
    const raw = body.message?.content ?? "";
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // 스키마를 강제해도 깨진 JSON 이 올 수 있다 — 원문은 raw 로 그대로 보여준다
    }

    // Ollama 의 duration 은 나노초 단위
    const nsToMs = (ns?: number) =>
      typeof ns === "number" ? Math.round(ns / 1e6) : null;

    this.logger.log(
      `캡처 인식 ${model} ${tookMs}ms (prompt ${body.prompt_eval_count ?? "?"} tok, eval ${body.eval_count ?? "?"} tok)`,
    );

    return {
      model,
      tookMs,
      promptTokens: body.prompt_eval_count ?? null,
      promptMs: nsToMs(body.prompt_eval_duration),
      evalTokens: body.eval_count ?? null,
      evalMs: nsToMs(body.eval_duration),
      imageWidth: info.width,
      imageHeight: info.height,
      parsed,
      raw,
    };
  }

  private async getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  }
}
