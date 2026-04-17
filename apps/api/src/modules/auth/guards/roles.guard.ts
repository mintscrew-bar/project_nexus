import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@nexus/database";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { PrismaService } from "../../prisma/prisma.service";

// ADMIN은 MODERATOR 권한을 포함함
const ROLE_HIERARCHY: Record<string, UserRole[]> = {
  [UserRole.ADMIN]: [UserRole.ADMIN, UserRole.MODERATOR, UserRole.USER],
  [UserRole.MODERATOR]: [UserRole.MODERATOR, UserRole.USER],
  [UserRole.USER]: [UserRole.USER],
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.user?.id;

    if (!userId) {
      throw new ForbiddenException("User not authenticated");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) {
      throw new ForbiddenException("User not found");
    }

    const effectiveRoles = ROLE_HIERARCHY[user.role] || [user.role];
    const hasRole = requiredRoles.some((role) => effectiveRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(", ")}`,
      );
    }

    return true;
  }
}
