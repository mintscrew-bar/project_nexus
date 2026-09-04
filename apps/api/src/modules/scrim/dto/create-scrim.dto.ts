import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

/** 포인트 규칙표. 대회마다 달라서 방마다 고칠 수 있게 받는다. */
export class PointRuleDto {
  /** 순위별 포인트. `[0]` 이 1위. 표에 없는 등수는 0점이다. */
  @IsArray()
  @ArrayMaxSize(100)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  @Max(1000, { each: true })
  placementPoints: number[];

  @IsNumber()
  @Min(0)
  @Max(1000)
  killPoints: number;
}

export class CreateScrimDto {
  /** 예정 라운드 수. 실제 진행 수는 라운드 기록으로 센다. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  totalRounds?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PointRuleDto)
  pointRule?: PointRuleDto;
}
