import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "@nexus/database";
import { BoardService } from "./board.service";
import { CreateBoardDto, UpdateBoardDto } from "./dto";

@Controller("boards")
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  // ── 공개: 게시판 목록 ────────────────────────────────────────────────
  /** 활성·노출 중인 게시판 목록 (커뮤니티 UI용) */
  @Get()
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  list() {
    return this.boardService.listPublic();
  }

  // ── 관리자: 게시판 관리 ──────────────────────────────────────────────
  /** 관리자용 전체 목록 (숨김/비활성 포함, 글 수 포함) */
  @Get("admin")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  listForAdmin() {
    return this.boardService.listForAdmin();
  }

  /** 게시판 순서 일괄 변경 */
  @Patch("admin/reorder")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  reorder(@Body() body: { items: Array<{ id: string; order: number }> }) {
    return this.boardService.reorder(body.items ?? []);
  }

  /** 게시판 생성 */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBoardDto) {
    return this.boardService.create(dto);
  }

  /** 게시판 수정 */
  @Patch(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateBoardDto) {
    return this.boardService.update(id, dto);
  }

  /** 게시판 삭제 (soft delete) */
  @Delete(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param("id") id: string) {
    return this.boardService.remove(id);
  }
}
