import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });
const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);
import { CommentLikedStatusDto } from "./comment-liked-status.dto";

/** 클라이언트: communityApi.getCommentLikedStatus(commentIds) → { commentIds } */
describe("CommentLikedStatusDto", () => {
  it("클라이언트 payload", () =>
    expect(
      run(CommentLikedStatusDto, { commentIds: ["c1", "c2"] }),
    ).resolves.toEqual({ commentIds: ["c1", "c2"] }));
  it("빈 배열도 받는다 (댓글이 없는 글)", () =>
    expect(
      run(CommentLikedStatusDto, { commentIds: [] }),
    ).resolves.toBeDefined());
  it("1000개까지 받고 1001개는 거부한다 — 글 상세는 댓글·답글 id 를 전부 보낸다", async () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
    await expect(
      run(CommentLikedStatusDto, { commentIds: ids(1000) }),
    ).resolves.toBeDefined();
    await rejects(CommentLikedStatusDto, { commentIds: ids(1001) });
  });
  it.each([
    ["없음 (예전엔 서비스에서 TypeError)", {}],
    ["배열이 아님", { commentIds: "c1" }],
    ["원소가 숫자", { commentIds: [1] }],
    ["원소가 객체", { commentIds: [{ not: "" }] }],
    ["모르는 키", { commentIds: [], postId: "p" }],
  ])("거부한다: %s", (_n, body) => rejects(CommentLikedStatusDto, body));
});
