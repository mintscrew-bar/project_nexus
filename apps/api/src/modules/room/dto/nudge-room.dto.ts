import { IsIn } from "class-validator";
import type { RoomNudgeReason } from "../room-nudge.service";

/** 로비 호출 사유. 준비 요청 / Discord 대기실 입장 요청 */
export class NudgeRoomDto {
  @IsIn(["READY", "VOICE"])
  reason: RoomNudgeReason;
}
