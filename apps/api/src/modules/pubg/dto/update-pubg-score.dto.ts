import { IsInt, Max, Min } from "class-validator";

export class UpdatePubgScoreDto {
  @IsInt()
  @Min(0)
  @Max(100)
  combatScore!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  iglScore!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  teamplayScore!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  consistencyScore!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  experienceScore!: number;
}
