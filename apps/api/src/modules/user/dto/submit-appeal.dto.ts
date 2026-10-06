import { IsString, MaxLength } from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/**
 * POST me/appeals — 정지·제재 이의신청 사유.
 * 빈 문자열은 서비스가 한국어 사유로 거부한다(기존 동작). 서비스 안의 "문자열이어야 한다"
 * 검사는 DTO 가 앞에서 막지만 방어용으로 둔다.
 */
export class SubmitAppealDto {
  @KeepRaw()
  @IsString({ message: "이의신청 사유 형식이 올바르지 않습니다." })
  @MaxLength(1000, { message: "이의신청 사유는 1000자 이내로 입력해주세요." })
  reason!: string;
}
