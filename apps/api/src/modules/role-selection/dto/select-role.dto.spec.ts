import "reflect-metadata";
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from "../../../common/validation-pipe.options";
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const run = (metatype: new () => object, body: unknown) =>
  pipe.transform(body, { type: "body", metatype });
const rejects = (metatype: new () => object, body: unknown) =>
  expect(run(metatype, body)).rejects.toBeInstanceOf(BadRequestException);
import { SelectRoleDto } from "./select-role.dto";

describe("SelectRoleDto", () => {
  it.each(["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"])("라인 %s", (role) =>
    expect(run(SelectRoleDto, { role })).resolves.toEqual({ role }),
  );
  it.each([
    ["없음", {}],
    ["열거값이 아님", { role: "COACH" }],
    ["소문자", { role: "top" }],
    ["객체", { role: { not: "" } }],
    ["모르는 키", { role: "TOP", force: true }],
  ])("거부한다: %s", (_n, body) => rejects(SelectRoleDto, body));
});
