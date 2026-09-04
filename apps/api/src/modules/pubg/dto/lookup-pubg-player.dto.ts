import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/** 등록 전 닉네임 확인. 계정이 실재하는지와 어느 샤드에서 플레이하는지를 돌려준다. */
export class LookupPubgPlayerDto {
  @IsString()
  @IsNotEmpty({ message: "PUBG 닉네임을 입력해주세요." })
  @MaxLength(50)
  playerName: string;
}
