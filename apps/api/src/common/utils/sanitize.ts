/**
 * HTML 새니타이즈 유틸리티
 *
 * 사용자 입력에서 위험한 HTML 태그와 속성을 제거한다.
 * 마크다운 렌더링을 위해 안전한 HTML 태그는 유지하고,
 * XSS 공격에 사용될 수 있는 위험 요소만 선택적으로 제거한다.
 */

/**
 * 위험한 HTML 태그 목록 (XSS 공격에 주로 사용되는 태그)
 * - script: 자바스크립트 실행
 * - iframe: 외부 페이지 삽입
 * - object, embed: 플러그인/외부 콘텐츠 삽입
 * - form: 피싱 폼 삽입
 * - base: 기본 URL 변경
 * - meta: 페이지 리다이렉트
 * - link: 외부 스타일시트 로드
 */
const DANGEROUS_TAGS_PATTERN =
  /<\s*\/?\s*(script|iframe|object|embed|form|base|meta|link)\b[^>]*>/gi;

/**
 * on* 이벤트 핸들러 속성 제거 (예: onclick, onload, onerror 등)
 * 태그 내부의 on으로 시작하는 속성을 매칭하여 제거한다.
 */
const EVENT_HANDLER_PATTERN = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * javascript: 프로토콜 URI 제거 (href, src, action 등에서 사용될 수 있음)
 * 대소문자 혼합, 공백/탭 삽입 등의 우회 시도도 차단한다.
 */
const JAVASCRIPT_URI_PATTERN =
  /(?:href|src|action|formaction|data)\s*=\s*(?:"[^"]*j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:[^"]*"|'[^']*j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:[^']*')/gi;

/**
 * data: URI 패턴 제거 (base64 인코딩된 스크립트 삽입 방지)
 */
const DATA_URI_PATTERN =
  /(?:href|src|action|formaction)\s*=\s*(?:"[^"]*data\s*:[^"]*"|'[^']*data\s*:[^']*')/gi;

/**
 * 사용자 입력에서 위험한 HTML 요소를 제거하는 새니타이즈 함수
 *
 * 마크다운 콘텐츠와 호환되도록 안전한 HTML 태그(p, b, i, a, img 등)는 유지하고,
 * XSS 공격에 사용되는 위험 태그, 이벤트 핸들러, javascript: URI만 선택적으로 제거한다.
 *
 * @param input - 새니타이즈할 원본 문자열
 * @returns 위험 요소가 제거된 안전한 문자열
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== "string") {
    return input;
  }

  let sanitized = input;

  // 1단계: 위험한 태그 제거 (script, iframe, object, embed, form, base, meta, link)
  sanitized = sanitized.replace(DANGEROUS_TAGS_PATTERN, "");

  // 2단계: javascript: 프로토콜 URI 제거
  sanitized = sanitized.replace(JAVASCRIPT_URI_PATTERN, "");

  // 3단계: data: URI 제거 (base64 스크립트 삽입 방지)
  sanitized = sanitized.replace(DATA_URI_PATTERN, "");

  // 4단계: on* 이벤트 핸들러 속성 제거 (onclick, onload 등)
  sanitized = sanitized.replace(EVENT_HANDLER_PATTERN, "");

  return sanitized;
}

/**
 * 모든 HTML 태그를 완전히 제거하는 엄격한 새니타이즈 함수
 *
 * 제목, 이름 등 플레인 텍스트만 허용해야 하는 필드에 사용한다.
 * 마크다운이 필요 없는 필드에 적합하다.
 *
 * @param input - 새니타이즈할 원본 문자열
 * @returns 모든 HTML 태그가 제거된 플레인 텍스트
 */
export function stripAllHtml(input: string): string {
  if (!input || typeof input !== "string") {
    return input;
  }

  // 모든 HTML 태그 제거
  let sanitized = input.replace(/<[^>]*>/g, "");

  // javascript: 프로토콜 제거
  sanitized = sanitized.replace(/javascript\s*:/gi, "");

  return sanitized;
}
