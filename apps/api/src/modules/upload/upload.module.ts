import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { randomUUID } from "crypto";
import { UploadService } from "./upload.service";

@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: join(__dirname, "..", "..", "..", "uploads"),
        filename: (req, file, cb) => {
          const randomName = randomUUID();
          const ext = extname(file.originalname);
          cb(null, `${randomName}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
          cb(null, true);
        } else {
          cb(new Error("지원하지 않는 이미지 형식입니다."), false);
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
