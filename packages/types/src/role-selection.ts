// ============================================
// 역할(라인) 선택 단계 공용 상수
// ============================================
//
// 서버(apps/api role-selection.service.ts)와 클라이언트(apps/web
// role-selection-store.ts)가 같은 값을 각자 하드코딩하고 있어서, 한쪽만
// 바뀌면 타이머 표시와 실제 만료 시각이 어긋났다. 두 곳 모두 여기서 가져간다.

/** 역할 선택 기본 제한 시간 (초) */
export const ROLE_SELECTION_TIME_SECONDS = 90;

/** 연장 1회당 추가되는 시간 (초) */
export const ROLE_SELECTION_EXTENSION_SECONDS = 15;

/** 유저 1명이 사용할 수 있는 최대 연장 횟수 */
export const ROLE_SELECTION_MAX_EXTENSIONS_PER_USER = 2;

/** 서버 내부 계산용 ms 환산값 */
export const ROLE_SELECTION_TIME_MS = ROLE_SELECTION_TIME_SECONDS * 1000;
export const ROLE_SELECTION_EXTENSION_MS =
  ROLE_SELECTION_EXTENSION_SECONDS * 1000;
