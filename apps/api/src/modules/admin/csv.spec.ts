import { toCsv } from "./csv";

const cols = [
  { key: "a", header: "가" },
  { key: "b", header: "나" },
];

describe("toCsv", () => {
  it("BOM 과 CRLF 로 엑셀에서 한글이 깨지지 않게 한다", () => {
    const out = toCsv(cols, [{ a: 1, b: "x" }]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe("﻿가,나\r\n1,x\r\n");
  });

  it("쉼표·따옴표·줄바꿈이 든 값은 감싸고 따옴표를 겹친다", () => {
    const out = toCsv(cols, [{ a: 'say "hi", ok', b: "줄\n바꿈" }]);
    expect(out).toContain('"say ""hi"", ok"');
    expect(out).toContain('"줄\n바꿈"');
  });

  it("수식으로 읽힐 문자열은 글자로 만든다 — 음수 숫자는 그대로", () => {
    const out = toCsv(cols, [
      { a: "=SUM(A1)", b: "+1" },
      { a: "-cmd", b: -5 },
      { a: "@x", b: "ok" },
    ]);
    expect(out).toContain("'=SUM(A1),'+1");
    expect(out).toContain("'-cmd,-5");
    expect(out).toContain("'@x,ok");
  });

  it("null·undefined 는 빈칸, 날짜는 ISO, 불리언은 true/false", () => {
    const out = toCsv(cols, [
      { a: null, b: undefined },
      { a: new Date("2026-10-06T00:00:00Z"), b: true },
    ]);
    expect(out).toContain("\r\n,\r\n");
    expect(out).toContain("2026-10-06T00:00:00.000Z,true");
  });

  it("행이 없어도 머리글은 나온다", () => {
    expect(toCsv(cols, [])).toBe("﻿가,나\r\n");
  });
});
