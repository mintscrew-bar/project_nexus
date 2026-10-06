import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/**
 * 방 컨트롤러의 인라인 `@Body()` 타입을 DTO 로 옮긴 것.
 *
 * 한도는 서비스가 이미 하던 검사와 같다(채팅 500자, 방 비밀번호 20자 — `JoinRoomDto`).
 * 식별자 상한 64 는 소켓 페이로드 검증(`isWsId`)과 맞췄다. 서비스 안의 검사는 방어용으로
 * 그대로 둔다. 문자열·불리언은 `@KeepRaw()` 로 암묵 형변환을 피한다.
 */

/** PATCH :id/broadcast-live — "이 방 고정 송출" 토글 */
export class SetBroadcastLiveDto {
  @KeepRaw()
  @IsBoolean({ message: "live는 true 또는 false여야 합니다." })
  live!: boolean;
}

/** PATCH :id/broadcast-focus — 중계 중인 경기 설정. null 은 해제 */
export class SetBroadcastFocusDto {
  @KeepRaw()
  @IsOptional()
  @IsString({ message: "matchId는 문자열이거나 null이어야 합니다." })
  @MaxLength(64, { message: "matchId 형식이 올바르지 않습니다." })
  matchId?: string | null;
}

/** POST :id/join — 방 id 는 경로에서 오므로 본문에는 없다 */
export class JoinRoomBodyDto {
  @KeepRaw()
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: "비밀번호는 20자 이하여야 합니다." })
  password?: string;

  @KeepRaw()
  @IsOptional()
  @IsBoolean({ message: "asSpectator는 true 또는 false여야 합니다." })
  asSpectator?: boolean;
}

/** POST :id/messages — 빈 메시지는 서비스가 한국어 사유와 함께 거부한다 */
export class SendRoomMessageDto {
  @KeepRaw()
  @IsString({ message: "content는 문자열이어야 합니다." })
  @MaxLength(500, { message: "메시지는 500자 이하여야 합니다." })
  content!: string;
}

/** POST :id/snake-draft/pick */
export class SnakeDraftPickDto {
  @KeepRaw()
  @IsString({ message: "targetPlayerId는 문자열이어야 합니다." })
  @IsNotEmpty({ message: "선택할 플레이어를 지정해주세요." })
  @MaxLength(64, { message: "targetPlayerId 형식이 올바르지 않습니다." })
  targetPlayerId!: string;
}
