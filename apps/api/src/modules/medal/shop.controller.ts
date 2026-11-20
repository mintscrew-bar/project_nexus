import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { ShopService } from "./shop.service";
import { ShopCatalogService } from "./shop-catalog.service";
import { EquipCosmeticDto, PurchaseCosmeticDto } from "./dto/shop.dto";

@Controller("shop")
export class ShopController {
  constructor(
    private readonly shopService: ShopService,
    private readonly catalog: ShopCatalogService,
  ) {}

  /**
   * 상품 그림 정의 — 관리자가 추가한 상품까지(로그인 없이).
   * 로비 카드·프로필이 남이 낀 장식을 그리려면 비로그인도 알아야 한다.
   */
  @Get("catalog")
  getCatalog() {
    return this.catalog.getPublicCatalog();
  }

  /** 상점 진열 — 잔액·보유·장착 */
  @Get()
  @UseGuards(JwtAuthGuard)
  getShop(@CurrentUser("sub") userId: string) {
    return this.shopService.getShop(userId);
  }

  /** 구매 (기본으로 바로 장착) */
  @Post("purchase")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  purchase(
    @CurrentUser("sub") userId: string,
    @Body() dto: PurchaseCosmeticDto,
  ) {
    return this.shopService.purchase(
      userId,
      dto.code,
      dto.equip ?? true,
      dto.expectedPrice,
    );
  }

  /** 장착·해제 */
  @Put("loadout")
  @UseGuards(JwtAuthGuard)
  equip(@CurrentUser("sub") userId: string, @Body() dto: EquipCosmeticDto) {
    return this.shopService.equip(userId, dto.slot, dto.code);
  }

  /**
   * 여러 사람의 장착 상태 — 로비 참가자 카드·프로필에서 쓴다.
   * 꾸미기는 남에게 보여주려는 것이라 로그인 없이도 읽을 수 있다.
   * 예: GET /shop/loadouts?userIds=a,b,c
   */
  @Get("loadouts")
  getLoadouts(@Query("userIds") userIds?: string) {
    return this.shopService.getLoadouts(
      (userIds ?? "").split(",").map((id) => id.trim()),
    );
  }
}
