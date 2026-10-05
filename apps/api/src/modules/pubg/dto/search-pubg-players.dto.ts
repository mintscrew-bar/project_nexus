import { Transform } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/** `GET /pubg/search` 쿼리. 글자 수 하한이 있어 한 글자로 전체 유저를 훑지 못한다. */
export class SearchPubgPlayersQueryDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: "검색어는 2자 이상이어야 합니다." })
  @MaxLength(30, { message: "검색어는 30자 이하여야 합니다." })
  q: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(20, { message: "limit는 20 이하여야 합니다." })
  limit?: number = 10;
}
