import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UserRole } from "@nexus/database";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ShopAdminService } from "./shop-admin.service";
import { UploadService } from "../upload/upload.service";
import {
  CreateShopDiscountDto,
  CreateShopItemDto,
  GrantShopItemDto,
  UpdateShopItemDto,
  UploadShopMediaQueryDto,
} from "./dto/shop-admin.dto";

/** 관리자 상점 관리 (ADMIN 전용) — 상품 현황·수정·추가/지우기·지급/회수·기간 할인 */
@Controller("shop/admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ShopAdminController {
  constructor(
    private readonly shopAdmin: ShopAdminService,
    private readonly upload: UploadService,
  ) {}

  /** 상품표 + 판매 현황 */
  @Get("items")
  listItems() {
    return this.shopAdmin.listItems();
  }

  /** 상품 수정(이름·설명·가격·등급·판매·숨김·순서) */
  @Patch("items/:code")
  updateItem(
    @CurrentUser("sub") adminId: string,
    @Param("code") code: string,
    @Body() dto: UpdateShopItemDto,
  ) {
    return this.shopAdmin.updateItem(adminId, code, dto);
  }

  /** 새 상품 추가(그림 빌리기 또는 올린 파일) */
  @Post("items")
  createItem(
    @CurrentUser("sub") adminId: string,
    @Body() dto: CreateShopItemDto,
  ) {
    return this.shopAdmin.createItem(adminId, dto);
  }

  /** 관리자 상품 지우기(가진 사람이 없을 때만) */
  @Delete("items/:code")
  deleteItem(@CurrentUser("sub") adminId: string, @Param("code") code: string) {
    return this.shopAdmin.deleteItem(adminId, code);
  }

  /**
   * 상품 파일 올리기 — 다 만든 WebM·MP4·WebP·PNG 를 손대지 않고 저장해 주소를 준다.
   * 이미지 업로드 모듈의 형식 거르기(이미지만)·5MB 한도를 쓰지 않으려고 여기서 따로 받는다.
   * 형식은 서비스가 파일 첫 바이트로 가린다.
   */
  @Post("media")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  async uploadMedia(
    @Query() query: UploadShopMediaQueryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("파일을 골라 주세요.");
    return { url: await this.upload.uploadCosmeticMedia(file, query.kind) };
  }

  /** 상품 지급(선물) */
  @Post("grant")
  @HttpCode(HttpStatus.OK)
  grant(@CurrentUser("sub") adminId: string, @Body() dto: GrantShopItemDto) {
    return this.shopAdmin.grant(adminId, dto.userId, dto.itemCode, dto.memo);
  }

  /** 상품 회수(메달은 돌려주지 않는다) */
  @Post("revoke")
  @HttpCode(HttpStatus.OK)
  revoke(@CurrentUser("sub") adminId: string, @Body() dto: GrantShopItemDto) {
    return this.shopAdmin.revoke(adminId, dto.userId, dto.itemCode, dto.memo);
  }

  /** 기간 할인 목록 */
  @Get("discounts")
  listDiscounts() {
    return this.shopAdmin.listDiscounts();
  }

  /** 기간 할인 만들기 */
  @Post("discounts")
  createDiscount(
    @CurrentUser("sub") adminId: string,
    @Body() dto: CreateShopDiscountDto,
  ) {
    return this.shopAdmin.createDiscount(adminId, {
      name: dto.name,
      percent: dto.percent,
      itemCodes: dto.itemCodes,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
    });
  }

  /** 기간 할인 끄기 */
  @Post("discounts/:id/stop")
  @HttpCode(HttpStatus.OK)
  stopDiscount(@CurrentUser("sub") adminId: string, @Param("id") id: string) {
    return this.shopAdmin.stopDiscount(adminId, id);
  }
}
