import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

/**
 * Redis pub/sub 기반 Socket.IO 어댑터
 * - 여러 서버 인스턴스가 동일한 Socket.IO 이벤트를 공유할 수 있도록 Redis 채널 사용
 * - Redis 연결 실패 시 graceful fallback: 인메모리 모드로 동작
 */
export class RedisIoAdapter extends IoAdapter {
  /** Redis 어댑터 팩토리 — null이면 인메모리 모드 */
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  /** pub 채널 전용 Redis 클라이언트 — 서버 종료 시 quit() 호출을 위해 멤버로 보관 */
  private pubClient: Redis | null = null;

  /** sub 채널 전용 Redis 클라이언트 — 서버 종료 시 quit() 호출을 위해 멤버로 보관 */
  private subClient: Redis | null = null;

  /**
   * Redis pub/sub 클라이언트 연결
   * - REDIS_URL 환경변수 사용 (기본값: redis://localhost:6379)
   * - 연결 실패 시 예외를 throw하지 않고 null 상태 유지 (서버는 계속 동작)
   */
  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    try {
      // pub/sub 각각 독립 클라이언트 생성 (ioredis 권장 패턴)
      const pubClient = new Redis(redisUrl, {
        // 연결 실패 시 바로 에러로 처리 (재시도 없음)
        maxRetriesPerRequest: 0,
        lazyConnect: true,
      });
      const subClient = pubClient.duplicate();

      // 두 클라이언트 모두 ready 상태가 될 때까지 대기
      await Promise.all([
        pubClient.connect(),
        subClient.connect(),
      ]);

      // 클래스 멤버로 보관 — close() 시 연결 정리에 사용
      this.pubClient = pubClient;
      this.subClient = subClient;

      this.adapterConstructor = createAdapter(pubClient, subClient);
      console.log('[RedisIoAdapter] Redis 어댑터 연결 성공');
    } catch (err) {
      // Redis 없이도 서버가 동작해야 하므로 경고만 출력
      console.warn('[RedisIoAdapter] Redis 연결 실패, 인메모리 모드로 동작:', err);
      this.adapterConstructor = null;
    }
  }

  /**
   * Socket.IO 서버 인스턴스 생성 시 Redis 어댑터 연결
   * - adapterConstructor가 null이면 기본 인메모리 어댑터 사용
   */
  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);

    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }

    return server;
  }

  /**
   * 서버 종료 시 Socket.IO 서버를 닫고 Redis 연결을 정리한다
   * - IoAdapter.close()를 오버라이드하여 graceful shutdown 시 호출됨
   * - pubClient / subClient가 존재할 때만 quit() 호출 (인메모리 모드 안전 처리)
   */
  async close(server: any): Promise<void> {
    // Socket.IO 서버 종료 (부모 동작 유지)
    await super.close(server);

    // Redis 연결 정리 — 메모리 누수 방지
    const cleanupPromises: Promise<string>[] = [];

    if (this.pubClient) {
      cleanupPromises.push(this.pubClient.quit());
      this.pubClient = null;
    }

    if (this.subClient) {
      cleanupPromises.push(this.subClient.quit());
      this.subClient = null;
    }

    if (cleanupPromises.length > 0) {
      console.log('[RedisIoAdapter] Redis 연결 종료 중...');
      try {
        await Promise.all(cleanupPromises);
        console.log('[RedisIoAdapter] Redis 연결 정리 완료');
      } catch (err) {
        console.error('[RedisIoAdapter] Redis 연결 종료 중 오류:', err);
      }
    }
  }
}
