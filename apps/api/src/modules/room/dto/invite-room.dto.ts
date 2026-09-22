import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/** 친구를 내전 방에 초대 */
export class InviteRoomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  friendId: string;
}
