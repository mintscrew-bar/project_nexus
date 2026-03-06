import { IsString, IsNotEmpty, IsOptional, MaxLength } from "class-validator";

/**
 * 내전방 입장 DTO
 */
export class JoinRoomDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  password?: string;
}
