import { ArrayMaxSize, IsArray, IsString, MaxLength } from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/**
 * POST comments/liked-status — 화면에 보이는 댓글들의 좋아요 여부를 한 번에 묻는다.
 * 상한 200 은 한 화면에 보이는 댓글 수보다 넉넉하게 잡았다. 상한이 없으면 수만 개를
 * 한 번에 `IN (...)` 으로 던질 수 있다.
 */
export class CommentLikedStatusDto {
  @KeepRaw()
  @IsArray({ message: "commentIds는 배열이어야 합니다." })
  @ArrayMaxSize(200, { message: "한 번에 최대 200개까지 조회할 수 있습니다." })
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  commentIds!: string[];
}
