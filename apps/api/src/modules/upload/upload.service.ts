import { BadRequestException, Injectable } from "@nestjs/common";
import { join } from "path";
import { unlink, open } from "fs/promises";

/** 이미지 포맷 매직 바이트 시그니처 목록 */
const IMAGE_SIGNATURES: Array<{
  mime: string;
  bytes: number[];
  offset?: number;
}> = [
  // JPEG: FF D8 FF
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    mime: "image/png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  // GIF87a / GIF89a: 47 49 46 38
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: "RIFF" 4바이트 + 4바이트 크기 + "WEBP"
  // offset 8에서 "WEBP" 시그니처 확인
  { mime: "image/webp", bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

@Injectable()
export class UploadService {
  private readonly uploadDir = join(__dirname, "..", "..", "..", "uploads");

  getFilePath(filename: string): string {
    return join(this.uploadDir, filename);
  }

  getFileUrl(filename: string): string {
    return `/uploads/${filename}`;
  }

  /**
   * 업로드된 파일의 바이너리 매직 바이트를 직접 읽어 실제 포맷을 검증한다.
   * 클라이언트가 선언한 MIME 타입(Content-Type 헤더)은 위조가 쉬우므로
   * 파일 첫 12바이트를 읽어 허용된 이미지 시그니처와 비교한다.
   *
   * 검증 실패 시 디스크의 파일을 즉시 삭제하고 예외를 던진다.
   */
  async validateMimeType(file: Express.Multer.File): Promise<void> {
    const filePath = this.getFilePath(file.filename);
    const HEADER_BYTES = 12;
    const buffer = Buffer.alloc(HEADER_BYTES);

    let fd: Awaited<ReturnType<typeof open>> | null = null;
    try {
      fd = await open(filePath, "r");
      await fd.read(buffer, 0, HEADER_BYTES, 0);
    } finally {
      await fd?.close();
    }

    const detected = IMAGE_SIGNATURES.find(({ bytes, offset = 0 }) =>
      bytes.every((b, i) => buffer[offset + i] === b),
    );

    if (!detected) {
      // 위험한 파일은 디스크에서 즉시 제거
      await this.deleteFile(file.filename).catch(() => null);
      throw new BadRequestException(
        "지원하지 않는 이미지 형식입니다. (JPEG, PNG, GIF, WebP만 허용)",
      );
    }
  }

  /**
   * 파일 삭제 전 filename이 UUID 포맷인지 검증하여 Path Traversal 방지.
   * Multer가 생성한 UUID 파일명 외의 경로는 거부한다.
   */
  async deleteFile(filename: string): Promise<void> {
    // UUID + 확장자 포맷만 허용 (예: 550e8400-e29b-41d4-a716-446655440000.png)
    if (!/^[a-f0-9\-]{36}\.\w{1,10}$/.test(filename)) {
      throw new BadRequestException("잘못된 파일명입니다.");
    }
    try {
      const filePath = this.getFilePath(filename);
      await unlink(filePath);
    } catch {
      // 파일이 없는 경우 무시
    }
  }
}
