import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class UpsertStreamerLinkDto {
  @IsString()
  @MaxLength(40, { message: "링크 이름은 40자 이하여야 합니다." })
  label!: string;

  @IsString()
  @MaxLength(500, { message: "링크 주소는 500자 이하여야 합니다." })
  url!: string;

  @IsOptional()
  @IsInt({ message: "순서는 정수여야 합니다." })
  @Min(0, { message: "순서는 0 이상이어야 합니다." })
  order?: number;
}
