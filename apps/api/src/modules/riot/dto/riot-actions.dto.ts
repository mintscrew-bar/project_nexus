import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/**
 * 라이엇 컨트롤러의 인라인 `@Body()` 타입을 DTO 로 옮긴 것.
 * 닉네임·태그라인 한도는 `RegisterRiotAccountDto` 와 같다(50자, 10자).
 * 이 DTO 가 없던 때는 본문이 비면 서비스의 `gameName.toLowerCase()` 에서 TypeError(500)가 났다.
 */

/** POST verify/start */
export class StartVerificationDto {
  @KeepRaw()
  @IsString()
  @IsNotEmpty({ message: "게임 닉네임을 입력해주세요." })
  @MaxLength(50)
  gameName!: string;

  @KeepRaw()
  @IsString()
  @IsNotEmpty({ message: "태그라인을 입력해주세요." })
  @MaxLength(10)
  tagLine!: string;
}

/** PUT accounts/:id/champions/:role — 최소 3개 검사는 서비스가 한다 */
export class UpdateChampionsDto {
  @KeepRaw()
  @IsArray({ message: "championIds는 배열이어야 합니다." })
  @ArrayMaxSize(20, { message: "챔피언은 최대 20개까지 지정할 수 있습니다." })
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  championIds!: string[];
}

/** POST tournament/create (ADMIN) — 라이엇 provider id 는 숫자 문자열이다 */
export class CreateTournamentDto {
  @KeepRaw()
  @IsString()
  @Matches(/^\d{1,18}$/, { message: "providerId는 숫자여야 합니다." })
  providerId!: string;
}
