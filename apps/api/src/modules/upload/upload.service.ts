import { BadRequestException, Injectable } from "@nestjs/common";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import { dirname, join, posix } from "path";
import { mkdir, unlink, writeFile } from "fs/promises";
import sharp from "sharp";

type UploadDriver = "local" | "r2";

interface DetectedImageType {
  mime: string;
  ext: ".jpg" | ".png" | ".gif" | ".webp";
}

export interface UploadImageOptions {
  directory?: string;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  fit?: "inside" | "cover";
}

/** 이미지 포맷 매직 바이트 시그니처 목록 */
const IMAGE_SIGNATURES: Array<
  DetectedImageType & { bytes: number[]; offset?: number }
> = [
  // JPEG: FF D8 FF
  { mime: "image/jpeg", ext: ".jpg", bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    mime: "image/png",
    ext: ".png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  // GIF87a / GIF89a: 47 49 46 38
  { mime: "image/gif", ext: ".gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: "RIFF" 4바이트 + 4바이트 크기 + "WEBP"
  {
    mime: "image/webp",
    ext: ".webp",
    bytes: [0x57, 0x45, 0x42, 0x50],
    offset: 8,
  },
];

@Injectable()
export class UploadService {
  private readonly uploadDir = join(__dirname, "..", "..", "..", "uploads");
  private readonly driver = this.resolveDriver();
  private readonly publicBaseUrl = this.normalizeBaseUrl(
    process.env.UPLOAD_PUBLIC_BASE_URL ||
      process.env.R2_PUBLIC_BASE_URL ||
      process.env.NEXT_PUBLIC_UPLOADS_BASE_URL ||
      "",
  );
  private s3Client: S3Client | null = null;

  getFilePath(filename: string): string {
    return join(this.uploadDir, this.normalizeKey(filename));
  }

  getFileUrl(filename: string): string {
    return this.toPublicUrl(this.normalizeKey(filename));
  }

  isManagedUrl(url: string): boolean {
    if (!url) return false;
    if (url.startsWith("/uploads/")) return true;
    if (!this.publicBaseUrl) return false;
    return (
      url === this.publicBaseUrl || url.startsWith(`${this.publicBaseUrl}/`)
    );
  }

  /**
   * 업로드 이미지를 검증한 뒤 리사이즈/압축하여 저장하고 공개 URL을 반환한다.
   * JPEG/PNG/WebP는 WebP로 변환해 용량을 줄인다. GIF는 애니메이션 보존을 위해 원본을 유지한다.
   */
  async uploadImage(
    file: Express.Multer.File,
    options: UploadImageOptions = {},
  ): Promise<string> {
    const detected = this.detectImageType(file);
    const processed = await this.processImage(file.buffer, detected, options);
    const key = this.createObjectKey(
      options.directory ?? "uploads",
      processed.ext,
    );

    if (this.driver === "r2") {
      await this.putR2Object(key, processed.buffer, processed.mime);
    } else {
      await this.writeLocalObject(key, processed.buffer);
    }

    return this.toPublicUrl(key);
  }

  /**
   * 클라이언트가 선언한 MIME 타입(Content-Type 헤더)은 위조가 쉬우므로
   * 파일 첫 12바이트를 읽어 허용된 이미지 시그니처와 비교한다.
   */
  async validateMimeType(file: Express.Multer.File): Promise<void> {
    this.detectImageType(file);
  }

  async deleteFile(filenameOrUrl: string): Promise<void> {
    const key = this.normalizeKey(filenameOrUrl);

    if (this.driver === "r2") {
      await this.getR2Client()
        .send(
          new DeleteObjectCommand({
            Bucket: this.requiredEnv("R2_BUCKET"),
            Key: key,
          }),
        )
        .catch(() => null);
      return;
    }

    await unlink(this.getFilePath(key)).catch(() => null);
  }

  private async processImage(
    input: Buffer,
    detected: DetectedImageType,
    options: UploadImageOptions,
  ): Promise<{ buffer: Buffer; mime: string; ext: ".gif" | ".webp" }> {
    if (detected.mime === "image/gif") {
      return { buffer: input, mime: "image/gif", ext: ".gif" };
    }

    const maxWidth = options.maxWidth ?? 2000;
    const maxHeight = options.maxHeight ?? 2000;
    const quality = options.quality ?? 82;
    const fit = options.fit ?? "inside";

    const buffer = await sharp(input, { failOn: "none" })
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit,
        withoutEnlargement: true,
      })
      .webp({ quality, effort: 4 })
      .toBuffer();

    return { buffer, mime: "image/webp", ext: ".webp" };
  }

  private detectImageType(file: Express.Multer.File): DetectedImageType {
    if (!file?.buffer || file.buffer.length < 12) {
      throw new BadRequestException("이미지 파일이 올바르지 않습니다.");
    }

    const detected = IMAGE_SIGNATURES.find(({ bytes, offset = 0 }) =>
      bytes.every((b, i) => file.buffer[offset + i] === b),
    );

    if (!detected) {
      throw new BadRequestException(
        "지원하지 않는 이미지 형식입니다. (JPEG, PNG, GIF, WebP만 허용)",
      );
    }

    return { mime: detected.mime, ext: detected.ext };
  }

  private createObjectKey(directory: string, ext: ".gif" | ".webp"): string {
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const safeDirectory =
      this.normalizeKey(directory).replace(/^uploads\/?/, "") || "uploads";
    return this.normalizeKey(
      `${safeDirectory}/${year}/${month}/${randomUUID()}${ext}`,
    );
  }

  private async writeLocalObject(key: string, buffer: Buffer) {
    const filePath = this.getFilePath(key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
  }

  private async putR2Object(key: string, buffer: Buffer, contentType: string) {
    await this.getR2Client().send(
      new PutObjectCommand({
        Bucket: this.requiredEnv("R2_BUCKET"),
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  private getR2Client(): S3Client {
    if (this.s3Client) return this.s3Client;

    const endpoint =
      process.env.R2_ENDPOINT ||
      `https://${this.requiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;

    this.s3Client = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: this.requiredEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: this.requiredEnv("R2_SECRET_ACCESS_KEY"),
      },
    });

    return this.s3Client;
  }

  private toPublicUrl(key: string): string {
    const normalizedKey = this.normalizeKey(key);
    if (this.driver === "r2") {
      if (!this.publicBaseUrl) {
        throw new BadRequestException("R2 공개 URL 설정이 필요합니다.");
      }
      return `${this.publicBaseUrl}/${normalizedKey}`;
    }
    return `/uploads/${normalizedKey}`;
  }

  private normalizeKey(value: string): string {
    let key = value.trim();

    if (!key) {
      throw new BadRequestException("잘못된 파일명입니다.");
    }

    try {
      const url = new URL(key);
      const publicBase = this.publicBaseUrl ? new URL(this.publicBaseUrl) : null;
      if (publicBase && url.origin === publicBase.origin) {
        const basePath = publicBase.pathname.replace(/\/+$/, "");
        key =
          basePath && url.pathname.startsWith(`${basePath}/`)
            ? url.pathname.slice(basePath.length)
            : url.pathname;
      } else {
        key = url.pathname;
      }
    } catch {
      // URL이 아니면 그대로 경로로 처리
    }

    key = key.replace(/^\/+/, "");
    if (key.startsWith("uploads/")) key = key.slice("uploads/".length);

    const normalized = posix.normalize(key);
    if (
      normalized === "." ||
      normalized.startsWith("../") ||
      normalized.includes("/../") ||
      normalized.includes("\0") ||
      !/^[a-zA-Z0-9/_\-.]+$/.test(normalized)
    ) {
      throw new BadRequestException("잘못된 파일명입니다.");
    }

    return normalized;
  }

  private normalizeBaseUrl(value: string): string {
    return value.trim().replace(/\/+$/, "");
  }

  private resolveDriver(): UploadDriver {
    return process.env.UPLOAD_DRIVER === "r2" ? "r2" : "local";
  }

  private requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new BadRequestException(`${name} 설정이 필요합니다.`);
    }
    return value;
  }
}
