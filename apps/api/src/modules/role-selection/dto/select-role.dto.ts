import { Role } from "@nexus/database";
import { IsEnum } from "class-validator";

/** POST :roomId/select-role — 라인 선택 */
export class SelectRoleDto {
  @IsEnum(Role, { message: "유효한 라인을 선택해주세요." })
  role!: Role;
}
