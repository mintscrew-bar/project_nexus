import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

export class ReorderBoardItemDto {
  @KeepRaw()
  @IsString()
  @MaxLength(64)
  id!: string;

  @KeepRaw()
  @IsInt({ message: "order는 정수여야 합니다." })
  @Min(0)
  @Max(100000)
  order!: number;
}

/**
 * PATCH admin/reorder (ADMIN) — 게시판 순서 일괄 변경.
 * 서비스가 항목마다 UPDATE 를 한 트랜잭션에 넣으므로 상한을 둔다.
 */
export class ReorderBoardsDto {
  @IsArray({ message: "items는 배열이어야 합니다." })
  @ArrayMaxSize(200, { message: "한 번에 최대 200개까지 정렬할 수 있습니다." })
  @ValidateNested({ each: true })
  @Type(() => ReorderBoardItemDto)
  items!: ReorderBoardItemDto[];
}
