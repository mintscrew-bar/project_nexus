import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });
const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);
import { UpdateMyStatusDto } from "./update-my-status.dto";

/** 클라이언트(presenceApi)는 { status } 로 ONLINE·AWAY 만 보낸다. */
describe("UpdateMyStatusDto", () => {
  it.each(["ONLINE", "AWAY"])("상태 %s", (status) =>
    expect(run(UpdateMyStatusDto, { status })).resolves.toEqual({ status }),
  );
  it.each([
    ["OFFLINE (서버가 정한다)", { status: "OFFLINE" }],
    ["없음", {}],
    ["소문자", { status: "away" }],
    ["모르는 키", { status: "AWAY", until: 1 }],
  ])("거부한다: %s", (_n, body) => rejects(UpdateMyStatusDto, body));
});
