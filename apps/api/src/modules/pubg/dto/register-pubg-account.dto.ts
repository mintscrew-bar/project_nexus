import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/**
 * PUBG 계정 등록.
 *
 * 플랫폼(스팀/카카오)을 묻지 않는다 — 닉네임 조회는 샤드와 무관하고,
 * 매치가 나오는 샤드는 서버가 찾아서 기억한다(Phase 0 Task 1 실측).
 * 편성 점수는 등록과 분리해 `PATCH /pubg/accounts/:id/score` 로 받는다.
 */
export class RegisterPubgAccountDto {
  @IsString()
  @IsNotEmpty({ message: "PUBG 닉네임을 입력해주세요." })
  @MaxLength(50)
  playerName: string;
}
