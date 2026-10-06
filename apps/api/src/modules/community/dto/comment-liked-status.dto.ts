import { ArrayMaxSize, IsArray, IsString, MaxLength } from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/**
 * POST comments/liked-status — 글의 댓글들 좋아요 여부를 한 번에 묻는다.
 * 글 상세는 댓글과 답글 id 를 **페이지 구분 없이 전부** 보낸다. 그래서 상한은 한 글에
 * 실제로 달릴 수 있는 수보다 넉넉한 1000 이다. 상한이 없으면 수만 개를 한 번에
 * `IN (...)` 으로 던질 수 있다.
 */
export class CommentLikedStatusDto {
  @KeepRaw()
  @IsArray({ message: "commentIds는 배열이어야 합니다." })
  @ArrayMaxSize(1000, {
    message: "한 번에 최대 1000개까지 조회할 수 있습니다.",
  })
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  commentIds!: string[];
}
