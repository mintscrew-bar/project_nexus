import { IsObject } from "class-validator";

/**
 * 방송 커스터마이징 저장.
 * 모양 검증은 normalizeBroadcastSettings(@nexus/types)가 맡는다 — 항목이 많고 자주
 * 늘어서 DTO 에 하나씩 적으면 두 곳이 어긋난다. 여기서는 객체인지만 본다.
 */
export class UpdateBroadcastSettingsDto {
  @IsObject()
  settings: Record<string, unknown>;
}
