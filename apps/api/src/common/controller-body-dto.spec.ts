import { readdirSync, readFileSync } from "fs";
import { join } from "path";

/**
 * 컨트롤러의 `@Body()` 는 **DTO 클래스**여야 한다 (회귀 방지).
 *
 * 전역 ValidationPipe 는 클래스만 검증한다. `@Body() body: { ... }` 같은 인라인 타입이나
 * `@Body("x") x: string` 은 검증도, 허용 필드 걸러내기도 받지 않는다. 게이트웨이의 맨몸
 * `@MessageBody()` 검사(ws-payload.pipe.spec.ts)와 같은 방식으로, 새 엔드포인트가
 * 검증 없이 들어오는 것을 막는다.
 */

/** `@Body("field", SomePipe)` 처럼 **파이프가 직접 검증하는** 단일 필드는 허용한다. */
const SINGLE_FIELD_WITH_PIPE = /@Body\(\s*"[^"]+"\s*,\s*\w+(?:\([^)]*\))?\s*\)/;

export function findUnvalidatedBodies(source: string): string[] {
  const problems: string[] = [];

  // @Body("field") — 파이프 없는 단일 필드
  for (const m of source.matchAll(/@Body\(\s*"[^"]+"\s*(?:,[^)]*)?\)/g)) {
    if (!SINGLE_FIELD_WITH_PIPE.test(m[0])) problems.push(m[0]);
  }

  // @Body() name: <타입> — 타입이 클래스 이름(대문자로 시작하는 식별자)이어야 한다
  for (const m of source.matchAll(/@Body\(\s*\)\s*\w+\??\s*:\s*([^,)=\n]+)/g)) {
    const type = m[1].trim();
    if (!/^[A-Z][A-Za-z0-9_]*$/.test(type)) problems.push(m[0]);
  }
  return problems;
}

describe("findUnvalidatedBodies (검사기 자체)", () => {
  it("인라인 객체 타입을 잡는다", () => {
    expect(findUnvalidatedBodies("@Body() body: { a: string },")).toHaveLength(
      1,
    );
    expect(findUnvalidatedBodies("@Body()\n    dto: {\n a: 1 }")).toHaveLength(
      1,
    );
  });
  it("원시 타입·any·Record 를 잡는다", () => {
    expect(findUnvalidatedBodies("@Body() b: any")).toHaveLength(1);
    expect(
      findUnvalidatedBodies("@Body() b: Record<string, unknown>"),
    ).toHaveLength(1);
    expect(findUnvalidatedBodies("@Body() b: string[]")).toHaveLength(1);
  });
  it("파이프 없는 단일 필드를 잡고, 파이프가 있으면 허용한다", () => {
    expect(findUnvalidatedBodies('@Body("role") role: UserRole')).toHaveLength(
      1,
    );
    expect(
      findUnvalidatedBodies('@Body("verified", ParseBoolPipe) v: boolean'),
    ).toHaveLength(0);
  });
  it("DTO 클래스는 통과한다", () => {
    expect(findUnvalidatedBodies("@Body() body: BanUserDto,")).toHaveLength(0);
    expect(findUnvalidatedBodies("@Body() dto?: CreateRoomDto")).toHaveLength(
      0,
    );
  });
});

describe("컨트롤러의 @Body() 는 모두 DTO 클래스다", () => {
  const modulesDir = join(__dirname, "..", "modules");
  const controllers = readdirSync(modulesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(modulesDir, d.name))
        .filter((f) => f.endsWith(".controller.ts"))
        .map((f) => join(modulesDir, d.name, f)),
    );

  it("컨트롤러를 찾았다", () => {
    expect(controllers.length).toBeGreaterThanOrEqual(20);
  });

  it.each(controllers.map((f) => [f.split("/").slice(-2).join("/"), f]))(
    "%s",
    (_name, file) => {
      expect(findUnvalidatedBodies(readFileSync(file, "utf8"))).toEqual([]);
    },
  );
});
