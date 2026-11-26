import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { KeepRaw } from "../../../common/keep-raw.decorator";

/** 스트리머 페이지 설정 — 보낸 항목만 바꾼다 */
export class UpdateStreamerPageDto {
  /** 머리 한마디. 빈 문자열이면 지운다 */
  @IsOptional()
  @IsString()
  @MaxLength(120, { message: "한마디는 120자까지 쓸 수 있어요." })
  tagline?: string;

  /** 정기 방송 요일 0(일)~6(토) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @IsIn([0, 1, 2, 3, 4, 5, 6], { each: true })
  scheduleDays?: number[];

  /** 정기 방송 시각 "HH:mm". null 이면 지운다 */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: "시각은 21:00 처럼 적어 주세요.",
  })
  scheduleTime?: string | null;

  // 전역 암묵 변환이 "false" 를 true 로 바꾸지 않게 원본 값으로 검증
  @KeepRaw()
  @IsOptional()
  @IsBoolean()
  showPrivateRooms?: boolean;
}

export class CreateStreamerNoticeDto {
  @IsString()
  @MinLength(1, { message: "공지 내용을 적어 주세요." })
  @MaxLength(500, { message: "공지는 500자까지 쓸 수 있어요." })
  content!: string;

  // 전역 암묵 변환이 "false" 를 true 로 바꾸지 않게 원본 값으로 검증
  @KeepRaw()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class UpdateStreamerNoticeDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "공지 내용을 적어 주세요." })
  @MaxLength(500, { message: "공지는 500자까지 쓸 수 있어요." })
  content?: string;

  // 전역 암묵 변환이 "false" 를 true 로 바꾸지 않게 원본 값으로 검증
  @KeepRaw()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
