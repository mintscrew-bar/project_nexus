import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsEnum,
  MaxLength,
} from "class-validator";
import { ClanRole } from "@nexus/database";

/**
 * 멤버 역할 변경 DTO
 */
export class UpdateMemberRoleDto {
  @IsEnum(ClanRole, { message: "유효하지 않은 역할입니다." })
  role: ClanRole;
}

/**
 * 소유권 이전 DTO
 */
export class TransferOwnershipDto {
  @IsString()
  @IsNotEmpty({ message: "새 소유자 ID를 입력해주세요." })
  newOwnerId: string;
}

/**
 * 공지사항 / 메시지 내용 DTO
 */
export class ContentDto {
  @IsString()
  @IsNotEmpty({ message: "내용을 입력해주세요." })
  @MaxLength(500, { message: "내용은 500자를 초과할 수 없습니다." })
  content: string;
}

/**
 * 초대 코드로 가입 DTO
 */
export class JoinByCodeDto {
  @IsString()
  @IsNotEmpty({ message: "초대 코드를 입력해주세요." })
  code: string;
}

/**
 * 유저 직접 초대 DTO
 */
export class InviteUserDto {
  @IsString()
  @IsNotEmpty({ message: "초대할 유저 ID를 입력해주세요." })
  inviteeId: string;
}

/**
 * 초대/가입 요청 수락 또는 거절 DTO
 */
export class ResolveDto {
  @IsBoolean({ message: "수락 여부를 boolean 값으로 입력해주세요." })
  accept: boolean;
}
