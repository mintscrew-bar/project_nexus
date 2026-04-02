import { Test, TestingModule } from "@nestjs/testing";
import { ShutdownService } from "./shutdown.service";

describe("ShutdownService", () => {
  let service: ShutdownService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShutdownService],
    }).compile();

    service = module.get<ShutdownService>(ShutdownService);
  });

  it("초기 상태에서 isShuttingDown()은 false를 반환한다", () => {
    expect(service.isShuttingDown()).toBe(false);
  });

  it("setShuttingDown() 호출 후 isShuttingDown()은 true를 반환한다", () => {
    service.setShuttingDown();
    expect(service.isShuttingDown()).toBe(true);
  });

  it("setShuttingDown()을 여러 번 호출해도 상태는 true로 유지된다 (멱등성)", () => {
    service.setShuttingDown();
    service.setShuttingDown();
    expect(service.isShuttingDown()).toBe(true);
  });

  it("setShuttingDown() 호출 전과 후의 상태 전환이 정확하다", () => {
    expect(service.isShuttingDown()).toBe(false);
    service.setShuttingDown();
    expect(service.isShuttingDown()).toBe(true);
  });
});
