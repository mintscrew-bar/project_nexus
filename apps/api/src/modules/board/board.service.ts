import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UserRole } from "@nexus/database";
import { CreateBoardDto } from "./dto/create-board.dto";
import { UpdateBoardDto } from "./dto/update-board.dto";

/** UserRole 권한 서열 — 값이 클수록 상위 권한 */
const ROLE_RANK: Record<UserRole, number> = {
  USER: 0,
  STREAMER: 1,
  MODERATOR: 2,
  ADMIN: 3,
};

@Injectable()
export class BoardService {
  constructor(private readonly prisma: PrismaService) {}

  /** 문자열을 슬러그 형태(소문자/숫자/하이픈)로 정규화 */
  private slugify(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /**
   * 공개용 게시판 목록: 삭제/숨김/비활성 제외, order 오름차순
   */
  async listPublic() {
    return this.prisma.board.findMany({
      where: { isDeleted: false, isHidden: false, isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  }

  /**
   * 관리자용 게시판 목록: 삭제만 제외(숨김/비활성 포함), 글 수 포함
   */
  async listForAdmin() {
    const boards = await this.prisma.board.findMany({
      where: { isDeleted: false },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { posts: true } },
      },
    });
    return boards;
  }

  /** id로 게시판 조회 (없으면 404) */
  async getByIdOrThrow(id: string) {
    const board = await this.prisma.board.findUnique({ where: { id } });
    if (!board || board.isDeleted) {
      throw new NotFoundException("게시판을 찾을 수 없습니다.");
    }
    return board;
  }

  /** slug로 게시판 조회 (없으면 null) */
  async getBySlug(slug: string) {
    const board = await this.prisma.board.findUnique({ where: { slug } });
    if (!board || board.isDeleted) return null;
    return board;
  }

  /**
   * 게시판 생성 (관리자)
   */
  async create(dto: CreateBoardDto) {
    const slug = this.slugify(dto.slug || dto.name);
    if (!slug) {
      throw new BadRequestException("유효한 슬러그를 생성할 수 없습니다.");
    }

    // 슬러그 중복 검사 (삭제된 게시판 포함 — unique 제약 충돌 방지)
    const existing = await this.prisma.board.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException("이미 사용 중인 슬러그입니다.");
    }

    // order 미지정 시 맨 뒤로 배치
    let order = dto.order;
    if (order == null) {
      const last = await this.prisma.board.findFirst({
        where: { isDeleted: false },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      order = (last?.order ?? -1) + 1;
    }

    return this.prisma.board.create({
      data: {
        slug,
        name: dto.name,
        fullName: dto.fullName ?? null,
        description: dto.description ?? null,
        iconName: dto.iconName ?? null,
        color: dto.color ?? null,
        order,
        writeRole: dto.writeRole ?? null,
        isActive: dto.isActive ?? true,
        isHidden: dto.isHidden ?? false,
      },
    });
  }

  /**
   * 게시판 수정 (관리자)
   */
  async update(id: string, dto: UpdateBoardDto) {
    await this.getByIdOrThrow(id);

    const data: Record<string, unknown> = {};

    if (dto.slug !== undefined) {
      const slug = this.slugify(dto.slug);
      if (!slug) throw new BadRequestException("유효한 슬러그가 아닙니다.");
      const dup = await this.prisma.board.findUnique({ where: { slug } });
      if (dup && dup.id !== id) {
        throw new ConflictException("이미 사용 중인 슬러그입니다.");
      }
      data.slug = slug;
    }
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.iconName !== undefined) data.iconName = dto.iconName;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.order !== undefined) data.order = dto.order;
    if (dto.writeRole !== undefined) data.writeRole = dto.writeRole;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.isHidden !== undefined) data.isHidden = dto.isHidden;

    return this.prisma.board.update({ where: { id }, data });
  }

  /**
   * 게시판 삭제 (soft delete) — 글은 boardId SetNull로 보존된다.
   * slug에 타임스탬프를 붙여 동일 슬러그 재사용을 허용한다.
   */
  async remove(id: string) {
    const board = await this.getByIdOrThrow(id);
    await this.prisma.board.update({
      where: { id },
      data: {
        isDeleted: true,
        isActive: false,
        // unique 슬러그 해제 — 동일 이름 게시판 재생성 가능하도록
        slug: `${board.slug}__deleted_${Date.now()}`,
      },
    });
    return { success: true };
  }

  /**
   * 게시판 순서 일괄 변경 (관리자) — [{id, order}] 배열
   */
  async reorder(items: Array<{ id: string; order: number }>) {
    await this.prisma.$transaction(
      items.map((it) =>
        this.prisma.board.update({
          where: { id: it.id },
          data: { order: it.order },
        }),
      ),
    );
    return this.listForAdmin();
  }

  /**
   * 글쓰기 권한 검증 — community 작성 시 사용.
   * 게시판이 존재/활성 상태여야 하고, writeRole이 지정되면 해당 권한 이상이어야 한다.
   */
  async assertCanWrite(boardId: string, userRole: UserRole) {
    const board = await this.getByIdOrThrow(boardId);
    if (!board.isActive) {
      throw new ForbiddenException("비활성화된 게시판입니다.");
    }
    if (board.writeRole && ROLE_RANK[userRole] < ROLE_RANK[board.writeRole]) {
      throw new ForbiddenException("이 게시판에 글을 작성할 권한이 없습니다.");
    }
    return board;
  }
}
