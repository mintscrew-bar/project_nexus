import { Injectable } from "@nestjs/common";
import { join } from "path";
import { unlink } from "fs/promises";

@Injectable()
export class UploadService {
  private readonly uploadDir = join(__dirname, "..", "..", "..", "uploads");

  getFilePath(filename: string): string {
    return join(this.uploadDir, filename);
  }

  getFileUrl(filename: string): string {
    return `/uploads/${filename}`;
  }

  async deleteFile(filename: string): Promise<void> {
    try {
      const filePath = this.getFilePath(filename);
      await unlink(filePath);
    } catch (error) {
      // File might not exist, ignore error
      console.error("Failed to delete file:", error);
    }
  }
}
