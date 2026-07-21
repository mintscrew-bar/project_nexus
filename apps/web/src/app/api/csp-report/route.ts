import { NextRequest } from "next/server";

const MAX_REPORT_BYTES = 16 * 1024;
const MAX_REPORTS_PER_REQUEST = 20;
const MAX_FIELD_LENGTH = 512;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function safeText(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  return String(value).slice(0, MAX_FIELD_LENGTH);
}

function safeUrl(value: unknown): string | undefined {
  const text = safeText(value);
  if (!text) return undefined;

  try {
    const url = new URL(text);
    // Query/hash에는 사용자 입력이나 토큰이 포함될 수 있으므로 로그에 남기지 않는다.
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, MAX_FIELD_LENGTH);
  } catch {
    return text.split(/[?#]/, 1)[0];
  }
}

function normalizeReport(value: unknown): UnknownRecord | null {
  const envelope = asRecord(value);
  if (!envelope) return null;

  const legacyBody = asRecord(envelope["csp-report"]);
  const reportingBody = asRecord(envelope.body);
  const body = legacyBody ?? reportingBody ?? envelope;

  const normalized = {
    type: safeText(envelope.type) ?? "csp-violation",
    disposition: safeText(body.disposition),
    documentUrl: safeUrl(body["document-uri"] ?? body.documentURL ?? envelope.url),
    referrer: safeUrl(body.referrer),
    blockedUrl: safeUrl(body["blocked-uri"] ?? body.blockedURL),
    effectiveDirective: safeText(
      body["effective-directive"] ?? body.effectiveDirective ?? body["violated-directive"],
    ),
    sourceFile: safeUrl(body["source-file"] ?? body.sourceFile),
    lineNumber: safeText(body["line-number"] ?? body.lineNumber),
    columnNumber: safeText(body["column-number"] ?? body.columnNumber),
    statusCode: safeText(body["status-code"] ?? body.statusCode),
  };

  return Object.fromEntries(Object.entries(normalized).filter(([, item]) => item !== undefined));
}

export async function POST(request: NextRequest): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REPORT_BYTES) {
    return new Response(null, { status: 413 });
  }

  try {
    const payload: unknown = JSON.parse(rawBody);
    const entries = Array.isArray(payload) ? payload : [payload];

    for (const entry of entries.slice(0, MAX_REPORTS_PER_REQUEST)) {
      const report = normalizeReport(entry);
      if (report) console.warn("[csp-report]", JSON.stringify(report));
    }
  } catch {
    // 브라우저 리포트 수집이 앱 동작에 영향을 주거나 재시도를 유발하지 않게 한다.
  }

  return new Response(null, { status: 204 });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204 });
}
