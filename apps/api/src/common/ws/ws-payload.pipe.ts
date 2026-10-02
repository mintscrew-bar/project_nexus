import { ArgumentMetadata, PipeTransform } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";

/**
 * 소켓 이벤트 페이로드 검증 (2026-10-02 소켓 점검 M1).
 *
 * 전역 `ValidationPipe`(main.ts)는 게이트웨이에 적용되지 않는다(Nest 하이브리드 앱 규칙).
 * 그래서 `@MessageBody() data: { roomId: string }` 의 타입 표기는 컴파일 때만 의미가 있고,
 * 런타임엔 클라이언트가 보낸 값이 그대로 들어왔다. 특히 위험한 건 Prisma 가 `undefined`
 * 필드를 where 에서 **지운다**는 점이다 — `findFirst({ where: { userId, roomId: data.roomId } })`
 * 가 `roomId` 누락 시 "아무 방에나 참가 중이면 통과"가 된다. 객체(`{ not: "" }`)를 넣으면
 * 필터로 해석되기도 한다.
 *
 * 사용: `@MessageBody(wsPayload({ roomId: f.id() })) data: { roomId: string }`
 * 이벤트마다 스키마를 명시한다 — 키 이름("…Id")으로 추측하지 않는다.
 */

/** cuid·uuid·`testbot_01` 같은 식별자. 길이와 문자를 좁게 잡는다 */
export const WS_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const isWsId = (value: unknown): value is string =>
  typeof value === "string" && WS_ID_PATTERN.test(value);

interface Field {
  /** true 면 undefined·null 을 허용한다 */
  optional: boolean;
  check: (value: unknown) => boolean;
}

export type WsSchema = Record<string, Field>;

const field = (check: Field["check"], optional = false): Field => ({
  check,
  optional,
});

/** 스키마 조각 */
export const f = {
  /** 필수 식별자 */
  id: () => field(isWsId),
  /** 없어도 되는 식별자 (null 도 "없음"으로 본다 — 예: 팀 선택 해제) */
  idOpt: () => field(isWsId, true),
  /** 식별자 배열 */
  idList: (opts: { optional?: boolean; max?: number } = {}) =>
    field(
      (v) =>
        Array.isArray(v) && v.length <= (opts.max ?? 50) && v.every(isWsId),
      opts.optional,
    ),
  /** 문자열. 길이 상한은 형식 검증용 안전선이고, 실제 제한은 서비스가 건다 */
  str: (opts: { max?: number; optional?: boolean } = {}) =>
    field(
      (v) => typeof v === "string" && v.length <= (opts.max ?? 10_000),
      opts.optional,
    ),
  bool: (opts: { optional?: boolean } = {}) =>
    field((v) => typeof v === "boolean", opts.optional),
  /** 유한한 정수 */
  int: (opts: { min?: number; max?: number; optional?: boolean } = {}) =>
    field(
      (v) =>
        typeof v === "number" &&
        Number.isInteger(v) &&
        v >= (opts.min ?? Number.MIN_SAFE_INTEGER) &&
        v <= (opts.max ?? Number.MAX_SAFE_INTEGER),
      opts.optional,
    ),
  oneOf: (values: readonly string[], opts: { optional?: boolean } = {}) =>
    field((v) => typeof v === "string" && values.includes(v), opts.optional),
};

export class WsPayloadPipe implements PipeTransform {
  constructor(private readonly schema: WsSchema) {}

  transform(value: unknown, metadata: ArgumentMetadata) {
    // @ConnectedSocket 등 다른 인자는 건드리지 않는다.
    if (metadata.type !== "body") return value;

    const entries = Object.entries(this.schema);
    const allOptional = entries.every(([, rule]) => rule.optional);

    if (value === undefined || value === null) {
      if (allOptional) return {};
      throw new WsException(this.message(entries[0]?.[0] ?? "payload"));
    }
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new WsException(this.message("payload"));
    }

    const body = value as Record<string, unknown>;
    for (const [key, rule] of entries) {
      const v = body[key];
      if (v === undefined || v === null) {
        if (rule.optional) continue;
        throw new WsException(this.message(key));
      }
      if (!rule.check(v)) throw new WsException(this.message(key));
    }
    return value;
  }

  private message(key: string) {
    return `잘못된 요청입니다. (${key})`;
  }
}

/** `@MessageBody(wsPayload({...}))` 용 */
export const wsPayload = (schema: WsSchema) => new WsPayloadPipe(schema);
