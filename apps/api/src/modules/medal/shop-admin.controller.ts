import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { UserRole } from "@nexus/database";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ShopAdminService } from "./shop-admin.service";
import {
  CreateShopDiscountDto,
  GrantShopItemDto,
  UpdateShopItemDto,
} from "./dto/shop-admin.dto";

/** 관리자 상점 관리 (ADMIN 전용) — 상품 현황·수정·지급/회수·기간 할인 */
@Controller("shop/admin")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ShopAdminController {
  constructor(private readonly shopAdmin: ShopAdminService) {}

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
