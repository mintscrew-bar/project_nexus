import { GameTitle } from "@nexus/database";
import { IsEnum, IsOptional } from "class-validator";

/** 목록 API의 게임 범위를 검증한다. 생략한 기존 호출은 전체 조회를 유지한다. */
export class GameScopeQueryDto {
  @IsOptional()
  @IsEnum(GameTitle)
  gameTitle?: GameTitle;
}
