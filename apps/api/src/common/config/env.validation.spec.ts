import { validateEnv } from "./env.validation";

const KEY_32 = Buffer.alloc(32, 7).toString("base64");
const SECRET_32 = "a".repeat(32);

function baseEnv(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@localhost:5432/nexus",
    JWT_ACCESS_SECRET: SECRET_32,
    JWT_REFRESH_SECRET: SECRET_32,
    DATA_ENCRYPTION_KEY: KEY_32,
    DATA_LOOKUP_HMAC_KEY: KEY_32,
    ...overrides,
  };
}

describe("validateEnv", () => {
  it("올바른 설정은 그대로 통과시킨다", () => {
    const env = baseEnv();
    expect(validateEnv(env)).toBe(env);
  });

  it("필수값이 없으면 부팅을 막는다", () => {
    expect(() => validateEnv(baseEnv({ DATABASE_URL: "" }))).toThrow(
      /DATABASE_URL/,
    );
  });

  it("여러 오류를 한 번에 모아서 보고한다", () => {
    // 하나 고치고 재배포했더니 다음 항목에서 또 막히는 상황을 피하기 위한 동작
    let message = "";
    try {
      validateEnv(
        baseEnv({ DATABASE_URL: "", JWT_ACCESS_SECRET: "", PORT: "abc" }),
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("JWT_ACCESS_SECRET");
    expect(message).toContain("PORT");
    expect(message).toContain("3건");
  });

  it("짧은 JWT 시크릿을 거부한다", () => {
    expect(() => validateEnv(baseEnv({ JWT_ACCESS_SECRET: "short" }))).toThrow(
      /JWT_ACCESS_SECRET.*짧/s,
    );
  });

  it("32바이트로 디코딩되지 않는 암호화 키를 거부한다", () => {
    // .env.example이 "base64 또는 hex"라고 안내하지만 코드는 base64만 받는다.
    const hexKey = "a".repeat(64);
    expect(() => validateEnv(baseEnv({ DATA_ENCRYPTION_KEY: hexKey }))).toThrow(
      /DATA_ENCRYPTION_KEY.*32바이트/s,
    );
  });

  it("운영에서 암호화 키가 없으면 부팅을 막는다", () => {
    expect(() => validateEnv(baseEnv({ DATA_LOOKUP_HMAC_KEY: "" }))).toThrow(
      /DATA_LOOKUP_HMAC_KEY/,
    );
  });

  it("개발에서는 암호화 키가 없어도 경고만 하고 부팅을 허용한다", () => {
    // 개발 흐름 대부분은 암호화를 타지 않는다. 부팅 자체를 막으면 방해만 된다.
    const env = baseEnv({
      NODE_ENV: "development",
      DATA_ENCRYPTION_KEY: "",
      DATA_LOOKUP_HMAC_KEY: "",
    });
    expect(() => validateEnv(env)).not.toThrow();
  });

  it("운영에 자리표시자 값이 남아 있으면 거부한다", () => {
    expect(() =>
      validateEnv(baseEnv({ POSTGRES_PASSWORD: "change-me-long-random" })),
    ).toThrow(/POSTGRES_PASSWORD/);
  });

  it("개발에서는 자리표시자를 막지 않는다", () => {
    expect(() =>
      validateEnv(
        baseEnv({ NODE_ENV: "development", SOME_KEY: "change-me-please" }),
      ),
    ).not.toThrow();
  });

  it("잘못된 URL과 CORS origin을 잡아낸다", () => {
    expect(() => validateEnv(baseEnv({ APP_URL: "not-a-url" }))).toThrow(
      /APP_URL/,
    );
    expect(() =>
      validateEnv(
        baseEnv({ CORS_ORIGINS: "https://ok.example.com, nope, also-bad" }),
      ),
    ).toThrow(/nope/);
  });

  it("TRUSTED_PROXIES를 모든 프록시 신뢰로 되돌리는 것을 막는다", () => {
    // 이 값이 true가 되면 X-Forwarded-For 위조로 rate limit이 뚫린다.
    for (const value of ["true", "*", "ALL"]) {
      expect(() => validateEnv(baseEnv({ TRUSTED_PROXIES: value }))).toThrow(
        /TRUSTED_PROXIES/,
      );
    }
    expect(() =>
      validateEnv(baseEnv({ TRUSTED_PROXIES: "loopback,uniquelocal" })),
    ).not.toThrow();
  });
});
