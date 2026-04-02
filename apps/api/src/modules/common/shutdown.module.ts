import { Global, Module } from "@nestjs/common";
import { ShutdownService } from "./shutdown.service";

/**
 * @Global() 선언으로 별도 import 없이 전체 앱에서 ShutdownService 주입 가능
 */
@Global()
@Module({
  providers: [ShutdownService],
  exports: [ShutdownService],
})
export class ShutdownModule {}
