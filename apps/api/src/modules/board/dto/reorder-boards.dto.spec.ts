import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });
const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);
import { ReorderBoardsDto } from "./reorder-boards.dto";

/** 클라이언트: boardApi.reorder(items) → { items: [{ id, order }] } */
describe("ReorderBoardsDto", () => {
  it("클라이언트 payload", async () => {
    const res: any = await run(ReorderBoardsDto, {
      items: [
        { id: "b1", order: 0 },
        { id: "b2", order: 1 },
      ],
    });
    expect(res.items).toHaveLength(2);
    expect(res.items[0]).toMatchObject({ id: "b1", order: 0 });
  });
  it("중첩 항목도 검증한다 — 항목의 잘못된 값을 잡는다", async () => {
    await rejects(ReorderBoardsDto, { items: [{ id: "b1", order: "1" }] });
    await rejects(ReorderBoardsDto, { items: [{ id: "b1", order: -1 }] });
    await rejects(ReorderBoardsDto, { items: [{ id: { not: "" }, order: 1 }] });
    await rejects(ReorderBoardsDto, { items: [{ id: "b1" }] });
    await rejects(ReorderBoardsDto, {
      items: [{ id: "b1", order: 1, extra: 1 }],
    });
  });
  it("200개 초과는 거부한다 (항목마다 UPDATE 가 한 트랜잭션에 들어간다)", async () => {
    const items = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `b${i}`, order: i }));
    await expect(
      run(ReorderBoardsDto, { items: items(200) }),
    ).resolves.toBeDefined();
    await rejects(ReorderBoardsDto, { items: items(201) });
  });
  it.each([
    ["없음 (예전엔 ?? [] 로 조용히 통과)", {}],
    ["배열이 아님", { items: "x" }],
    ["모르는 키", { items: [], dryRun: true }],
  ])("거부한다: %s", (_n, body) => rejects(ReorderBoardsDto, body));
});
