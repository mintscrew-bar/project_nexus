import { Body, Controller, Post, Request, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { OptionalJwtGuard } from "../auth/guards/optional-jwt.guard";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClientErrorLogDto } from "./dto/client-error-log.dto";

@Controller("client-error-logs")
export class ClientErrorLogController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @UseGuards(OptionalJwtGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async create(@Body() dto: CreateClientErrorLogDto, @Request() req: any) {
    await this.prisma.clientErrorLog.create({
      data: {
        userId: req.user?.sub ?? req.user?.id ?? null,
        message: dto.message,
        path: dto.path,
        source: dto.source,
        userAgent: dto.userAgent,
        metadata: dto.metadata as any,
      },
    });

    return { ok: true };
  }
}
