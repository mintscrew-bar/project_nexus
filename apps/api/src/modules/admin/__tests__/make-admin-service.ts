import { AdminService } from "../admin.service";

/**
 * 테스트용 AdminService 생성.
 *
 * 생성자가 위치 인자 8개라 순서를 틀리기 쉽다(실제로 봇 정리 테스트에서 roomService 를
 * 엉뚱한 자리에 넣어 깨졌다). 이름으로 넘기고, 안 넘긴 의존성은 빈 객체로 채운다.
 * 의존성이 늘어도 이 파일만 고치면 된다.
 */
export interface AdminServiceDeps {
  prisma: unknown;
  discordBot: unknown;
  adminAlerts: unknown;
  discordVoice: unknown;
  roomService: unknown;
  dmService: unknown;
  dmGateway: unknown;
  notificationService: unknown;
}

export function makeAdminService(deps: Partial<AdminServiceDeps> = {}) {
  const d = (value: unknown) => (value ?? {}) as any;
  return new AdminService(
    d(deps.prisma),
    d(deps.discordBot),
    d(deps.adminAlerts),
    d(deps.discordVoice),
    d(deps.roomService),
    d(deps.dmService),
    d(deps.dmGateway),
    d(deps.notificationService),
  );
}
