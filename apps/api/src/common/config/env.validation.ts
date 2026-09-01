import { Logger } from "@nestjs/common";

/**
 * 부팅 시점 환경변수 검증.
 *
 * 없거나 잘못된 설정이 "그 기능을 처음 쓸 때"까지 숨어 있으면,
 * 배포는 성공한 것처럼 보이는데 로그인이나 암호화 경로에서만 터진다.
 * (예: DATA_ENCRYPTION_KEY는 encryptSensitive 첫 호출에서야 검사된다)
 * 그런 실패를 배포 즉시 드러내는 것이 목적이다.
 *
 * 첫 오류에서 멈추지 않고 전부 모아 한 번에 보고한다 —
 * 한 번 고치고 재배포했더니 다음 항목에서 또 막히는 상황을 피한다.
 */

/** base64로 디코딩했을 때 정확히 32바이트여야 하는 키 (AES-256-GCM / HMAC) */
const BASE64_32BYTE_KEYS = ["DATA_ENCRYPTION_KEY", "DATA_LOOKUP_HMAC_KEY"];

/** .env.example의 자리표시자가 그대로 배포되는 것을 막는다 */
const PLACEHOLDER_PATTERN = /change-me/i;

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function decodesTo32Bytes(value: string): boolean {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = asString(config.NODE_ENV) === "production";

  // ── 없으면 어떤 환경에서도 API가 동작하지 않는 값 ──
  for (const key of [
    "DATABASE_URL",
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
  ]) {
    if (!asString(config[key])) errors.push(`${key}이(가) 비어 있습니다.`);
  }

  // JWT 시크릿 길이 — 짧은 시크릿은 서명 위조 위험을 키운다.
  for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"]) {
    const value = asString(config[key]);
    if (value && value.length < 32) {
      errors.push(
        `${key}이(가) 너무 짧습니다. 32자 이상 필요 (현재 ${value.length}자).`,
      );
    }
  }

  // ── 암호화 키 ──
  // 개발에서는 대부분의 흐름이 암호화를 타지 않으므로 경고로만 알리고 부팅은 허용한다.
  // 운영에서는 로그인/가입이 통째로 실패하므로 부팅을 막는다.
  for (const key of BASE64_32BYTE_KEYS) {
    const value = asString(config[key]);
    if (!value) {
      const message = `${key}이(가) 없습니다. 이메일 암호화·조회 해시 경로가 실패합니다.`;
      if (isProduction) errors.push(message);
      else warnings.push(message);
      continue;
    }
    if (!decodesTo32Bytes(value)) {
      errors.push(
        `${key}은(는) base64로 디코딩했을 때 정확히 32바이트여야 합니다. (hex는 지원하지 않음)`,
      );
    }
  }

  // ── Discord OAuth ──
  // 로그인 시작 라우트가 authorize URL을 직접 조립하므로, 값이 없으면
  // client_id=undefined인 URL로 리다이렉트되어 Discord 쪽 오류 화면만 뜬다.
  // 서버에서 먼저 막는 편이 원인을 훨씬 빨리 알 수 있다.
  for (const key of ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"]) {
    if (!asString(config[key])) {
      const message = `${key}이(가) 없습니다. Discord 로그인이 동작하지 않습니다.`;
      if (isProduction) errors.push(message);
      else warnings.push(message);
    }
  }

  // ── 자리표시자가 그대로 배포되는 것 방지 ──
  if (isProduction) {
    for (const [key, value] of Object.entries(config)) {
      if (PLACEHOLDER_PATTERN.test(asString(value))) {
        errors.push(
          `${key}에 .env.example 자리표시자 값이 그대로 들어 있습니다.`,
        );
      }
    }
  }

  // ── 형식 검증 ──
  const port = asString(config.PORT);
  if (port && !/^\d+$/.test(port)) {
    errors.push(`PORT는 숫자여야 합니다. (현재 "${port}")`);
  }

  for (const key of ["APP_URL", "API_URL", "NEXTAUTH_URL", "REDIS_URL"]) {
    const value = asString(config[key]);
    if (value && !isValidUrl(value)) {
      errors.push(`${key}이(가) 올바른 URL이 아닙니다. (현재 "${value}")`);
    }
  }

  const corsOrigins = asString(config.CORS_ORIGINS);
  if (corsOrigins) {
    const invalid = corsOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin && !isValidUrl(origin));
    if (invalid.length > 0) {
      errors.push(
        `CORS_ORIGINS에 올바르지 않은 origin이 있습니다: ${invalid.join(", ")}`,
      );
    }
  }

  // 모든 프록시를 신뢰하면 X-Forwarded-For 위조로 IP 기반 rate limit이 뚫린다.
  const trustedProxies = asString(config.TRUSTED_PROXIES).toLowerCase();
  if (["true", "*", "all"].includes(trustedProxies)) {
    errors.push(
      `TRUSTED_PROXIES에 "${trustedProxies}"는 쓸 수 없습니다. ` +
        `모든 프록시를 신뢰하면 X-Forwarded-For 위조로 rate limit이 우회됩니다. ` +
        `신뢰할 대역이나 IP를 쉼표로 나열하세요.`,
    );
  }

  if (warnings.length > 0) {
    const logger = new Logger("EnvValidation");
    for (const warning of warnings) logger.warn(warning);
  }

  if (errors.length > 0) {
    throw new Error(
      `환경변수 검증 실패 (${errors.length}건):\n` +
        errors.map((error) => `  - ${error}`).join("\n"),
    );
  }

  return config;
}
