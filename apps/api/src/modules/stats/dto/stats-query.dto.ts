import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

const QUEUE_GROUPS = ["ranked", "normal", "aram", "custom", "all"] as const;
export type QueueGroupQuery = (typeof QUEUE_GROUPS)[number];

// /stats/users/search
export class SearchUsersQueryDto {
  @IsString()
  @IsNotEmpty({ message: "검색어(q)는 필수입니다." })
  q: string;

  @IsOptional()
  @IsInt({ message: "limit는 정수여야 합니다." })
  @Min(1, { message: "limit는 1 이상이어야 합니다." })
  @Max(50, { message: "limit는 50 이하여야 합니다." })
  limit?: number = 10;
}

// /stats/summoner/:gameName/:tagLine/matches
export class MatchHistoryQueryDto {
  @IsOptional()
  @IsInt({ message: "count는 정수여야 합니다." })
  @Min(1, { message: "count는 1 이상이어야 합니다." })
  @Max(100, { message: "count는 100 이하여야 합니다." })
  count?: number = 20;

  @IsOptional()
  @IsInt({ message: "queueId는 정수여야 합니다." })
  queueId?: number;

  @IsOptional()
  @IsInt({ message: "start는 정수여야 합니다." })
  @Min(0, { message: "start는 0 이상이어야 합니다." })
  start?: number = 0;
}

// /stats/user/:userId/riot-matches
export class UserMatchHistoryQueryDto {
  @IsOptional()
  @IsInt({ message: "count는 정수여야 합니다." })
  @Min(1, { message: "count는 1 이상이어야 합니다." })
  @Max(100, { message: "count는 100 이하여야 합니다." })
  count?: number = 20;

  @IsOptional()
  @IsInt({ message: "queueId는 정수여야 합니다." })
  queueId?: number;
}

// /stats/summoner (find user by riot account)
export class FindSummonerQueryDto {
  @IsString()
  @IsNotEmpty({ message: "gameName은 필수입니다." })
  gameName: string;

  @IsString()
  @IsNotEmpty({ message: "tagLine은 필수입니다." })
  tagLine: string;
}

// /stats/refresh/:userId
export class RefreshStatsQueryDto {
  @IsOptional()
  @IsIn(QUEUE_GROUPS, {
    message:
      "queueGroup은 ranked, normal, aram, custom, all 중 하나여야 합니다.",
  })
  queueGroup?: QueueGroupQuery = "ranked";
}
