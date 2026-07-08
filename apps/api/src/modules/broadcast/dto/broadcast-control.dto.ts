import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export const BROADCAST_CONTROL_SCENES = [
  "auto",
  "idle",
  "room",
  "auction",
  "role-selection",
  "bracket",
  "match",
  "result",
  "break",
] as const;

export type BroadcastControlScene = (typeof BROADCAST_CONTROL_SCENES)[number];

export class UpdateBroadcastControlDto {
  @IsOptional()
  @IsIn(BROADCAST_CONTROL_SCENES)
  scene?: BroadcastControlScene;

  @IsOptional()
  @IsBoolean()
  lowerThirdVisible?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  announcement?: string | null;
}

export class BroadcastControlActionDto extends UpdateBroadcastControlDto {}
