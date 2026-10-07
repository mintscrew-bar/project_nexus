import "reflect-metadata";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "./validation-pipe.options";
import { UpdateSettingsDto } from "../modules/user/dto/update-settings.dto";
import { RegisterDto } from "../modules/auth/dto/register.dto";
import { ResolveDto } from "../modules/clan/dto/clan-body.dto";

/**
 * 본문 DTO 의 불리언은 `@KeepRaw()` 로 원본을 검증해야 한다 (리팩터링 Task 25).
 *
 * 전역 `enableImplicitConversion` 때문에 `{ "flag": "false" }` 가 `Boolean("false")` =
 * **true** 로 바뀐 뒤 `@IsBoolean` 을 통과한다. 알림 끄기·약관 동의·초대 거절 같은
 * 값이 정반대로 저장될 수 있다. 쿼리 DTO(`*query*.dto.ts`)는 쿼리스트링이 원래
 * 문자열이라 변환이 필요하므로 제외한다.
 */

function dtoFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return dtoFiles(full);
    return name.endsWith(".dto.ts") && !/query/i.test(name) ? [full] : [];
  });
}

/** 필드 하나의 데코레이터 묶음(빈 줄·필드 선언 사이)에 IsBoolean 이 있으면 KeepRaw 도 있어야 한다 */
export function booleansWithoutKeepRaw(source: string): string[] {
  const problems: string[] = [];
  // 필드 선언 직전까지의 데코레이터 블록을 잘라 본다
  const blocks = source.split(/\n\s*\n/);
  for (const block of blocks) {
    if (!/@IsBoolean\(/.test(block)) continue;
    const field = /^\s+([A-Za-z0-9_]+)[?!]?\s*:/m.exec(block)?.[1] ?? "?";
    if (!/@KeepRaw\(\)/.test(block)) problems.push(field);
  }
  return problems;
}

describe("booleansWithoutKeepRaw (검사기 자체)", () => {
  it("KeepRaw 없는 불리언을 잡는다", () => {
    expect(
      booleansWithoutKeepRaw(
        "  @IsOptional()\n  @IsBoolean()\n  flag?: boolean;\n",
      ),
    ).toEqual(["flag"]);
  });
  it("KeepRaw 가 있으면 통과", () => {
    expect(
      booleansWithoutKeepRaw(
        "  @KeepRaw()\n  @IsOptional()\n  @IsBoolean()\n  flag?: boolean;\n",
      ),
    ).toEqual([]);
  });
});

describe("본문 DTO 의 불리언은 모두 @KeepRaw() 가 붙어 있다", () => {
  const files = dtoFiles(join(__dirname, "..", "modules"));

  it("DTO 파일을 찾았다", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.map((f) => [f.split("/modules/")[1], f]))("%s", (_n, file) => {
    expect(booleansWithoutKeepRaw(readFileSync(file, "utf8"))).toEqual([]);
  });
});

describe("문자열 'false' 는 true 로 바뀌지 않고 400 이다 (대표 DTO)", () => {
  const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
  const run = (metatype: new () => object, body: unknown) =>
    pipe.transform(body, { type: "body", metatype });

  it("알림 설정: 끄기(false)가 켜기로 저장되지 않는다", async () => {
    await expect(
      run(UpdateSettingsDto, { notifyMatchStart: "false" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    // 클라이언트(체크박스 e.target.checked)는 진짜 불리언을 보낸다
    await expect(
      run(UpdateSettingsDto, { notifyMatchStart: false }),
    ).resolves.toMatchObject({ notifyMatchStart: false });
  });

  it("회원가입: 약관 동의가 문자열로 통과하지 않는다", async () => {
    const base = {
      email: "a@b.co",
      password: "password123",
      username: "tester",
      privacyPolicy: true,
      ageVerification: true,
    };
    await expect(
      run(RegisterDto, { ...base, termsOfService: "false" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      run(RegisterDto, { ...base, termsOfService: true }),
    ).resolves.toBeDefined();
  });

  it("클랜 초대 거절: 'false' 가 수락으로 바뀌지 않는다", async () => {
    await expect(run(ResolveDto, { accept: "false" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(run(ResolveDto, { accept: false })).resolves.toMatchObject({
      accept: false,
    });
  });
});
