import { IsIn } from "class-validator";

/**
 * PUT me — 내 접속 상태. 클라이언트(`presenceApi`)는 ONLINE·AWAY 만 보낸다.
 * OFFLINE 은 소켓 연결이 끊길 때 서버가 정한다. 예전에는 모르는 값이 와도 ONLINE 으로
 * 조용히 처리됐지만, 이제는 400 이다.
 */
export class UpdateMyStatusDto {
  @IsIn(["ONLINE", "AWAY"], {
    message: "status는 ONLINE 또는 AWAY여야 합니다.",
  })
  status!: "ONLINE" | "AWAY";
}
