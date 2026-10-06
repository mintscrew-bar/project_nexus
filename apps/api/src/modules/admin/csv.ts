/**
 * CSV 만들기. 엑셀에서 바로 열리게 UTF-8 BOM 을 붙이고, 수식 주입을 막는다.
 *
 * 값이 `=` `+` `-` `@` 로 시작하면 엑셀이 수식으로 실행한다. 유입 경로처럼 사용자가
 * 정할 수 있는 문자열이 섞이므로 앞에 `'` 를 붙여 글자로 읽히게 한다. 음수 숫자는
 * 수식이 아니라 숫자라 건드리지 않는다.
 */
const BOM = "﻿";

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "boolean"
        ? value
          ? "true"
          : "false"
        : String(value);

  const isNumber = typeof value === "number" && Number.isFinite(value);
  if (!isNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;

  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  columns: { key: string; header: string }[],
  rows: Record<string, unknown>[],
): string {
  const head = columns.map((c) => cell(c.header)).join(",");
  const body = rows.map((row) =>
    columns.map((c) => cell(row[c.key])).join(","),
  );
  return BOM + [head, ...body].join("\r\n") + "\r\n";
}
