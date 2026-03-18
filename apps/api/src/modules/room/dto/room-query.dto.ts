import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";
import { RoomStatus, TeamMode } from "@nexus/database";

/** 방 목록 조회 쿼리 DTO */
export class ListRoomsQueryDto {
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @IsOptional()
  @IsEnum(TeamMode)
  teamMode?: TeamMode;

  @IsOptional()
  @IsBoolean({ message: "includePrivate는 boolean이어야 합니다." })
  includePrivate?: boolean = false;
}

/** 채팅 메시지 조회 쿼리 DTO */
export class ChatMessagesQueryDto {
  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(100, { message: "limit는 100 이하여야 합니다." })
  limit?: number = 50;
}
