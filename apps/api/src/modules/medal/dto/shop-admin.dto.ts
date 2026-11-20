import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { COSMETIC_SLOTS, type CosmeticSlot } from "@nexus/types";
import { KeepRaw } from "../../../common/keep-raw.decorator";

const RARITIES = ["STARTER", "COMMON", "PREMIUM", "RARE"] as const;

/**
 * PATCH shop/admin/items/:code (ADMIN) — 넘긴 필드만 바꾼다.
 * null 은 "원본(코드) 값으로 되돌리기". 본문 값은 KeepRaw 로 형변환 없이 검증한다.
 */
export class UpdateShopItemDto {
  @KeepRaw()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  name?: string | null;

  @KeepRaw()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @KeepRaw()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(100000)
  price?: number | null;

  @KeepRaw()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(RARITIES)
  rarity?: (typeof RARITIES)[number] | null;

  @KeepRaw()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsBoolean()
  onSale?: boolean | null;

  @KeepRaw()
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;

  @KeepRaw()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number | null;
}

/** POST shop/admin/grant · revoke (ADMIN) */
export class GrantShopItemDto {
  @KeepRaw()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @KeepRaw()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  itemCode!: string;

  /** 사유 — 감사 로그에 남는다 */
  @KeepRaw()
  @IsString()
  @IsNotEmpty({ message: "사유를 적어주세요." })
  @MaxLength(300)
  memo!: string;
}

/** POST shop/admin/discounts (ADMIN) — itemCodes 가 비면 전체 상품 */
export class CreateShopDiscountDto {
  @KeepRaw()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name!: string;

  @KeepRaw()
  @IsInt()
  @Min(1)
  @Max(90)
  percent!: number;

  @KeepRaw()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  itemCodes!: string[];

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;
}

/** POST shop/admin/items (ADMIN) — 새 상품. 그림은 baseCode 또는 올린 파일(posterUrl) */
export class CreateShopItemDto {
  @IsIn(COSMETIC_SLOTS)
  slot!: CosmeticSlot;

  @KeepRaw()
  @IsString()
  @IsNotEmpty({ message: "이름을 적어 주세요." })
  @MaxLength(40)
  name!: string;

  @KeepRaw()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  description?: string | null;

  @KeepRaw()
  @IsInt()
  @Min(1)
  @Max(100000)
  price!: number;

  @IsIn(RARITIES)
  rarity!: (typeof RARITIES)[number];

  @KeepRaw()
  @IsOptional()
  @IsBoolean()
  onSale?: boolean;

  @KeepRaw()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(64)
  baseCode?: string | null;

  @KeepRaw()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  videoUrl?: string | null;

  @KeepRaw()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  mp4Url?: string | null;

  @KeepRaw()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  posterUrl?: string | null;
}

/** POST shop/admin/media?kind= (ADMIN) — 상품 파일 종류 */
export class UploadShopMediaQueryDto {
  @IsIn(["video", "mp4", "image"])
  kind!: "video" | "mp4" | "image";
}
