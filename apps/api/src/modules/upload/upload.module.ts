import { BadRequestException, Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { UploadService } from "./upload.service";
import { Request } from "express"; // Import Request from express

@Module({
  imports: [
    MulterModule.register({
      storage: memoryStorage(),
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        if (file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          cb(null, true);
        } else {
          // 순수 Error를 넘기면 GlobalExceptionFilter가 500으로 처리한다.
          // 사용자 입력 문제이므로 HttpException으로 던져 400이 나가게 한다.
          cb(
            new BadRequestException("지원하지 않는 이미지 형식입니다."),
            false,
          );
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
      },
    }),
  ],
  providers: [UploadService],
  exports: [MulterModule, UploadService],
})
export class UploadModule {}
