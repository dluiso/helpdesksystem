import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AttachmentScanResult, AttachmentScanStatus } from "@prisma/client";
import net from "node:net";

export interface FileScanOutcome {
  scanStatus: AttachmentScanStatus;
  scanResult: AttachmentScanResult;
}

@Injectable()
export class FileScanService {
  private readonly logger = new Logger(FileScanService.name);

  constructor(private readonly config: ConfigService) {}

  async scanBuffer(buffer: Buffer): Promise<FileScanOutcome> {
    if ((this.config.get<string>("CLAMAV_ENABLED") ?? "false").toLowerCase() !== "true") {
      return { scanStatus: AttachmentScanStatus.PENDING, scanResult: AttachmentScanResult.NOT_SCANNED };
    }

    try {
      const response = await this.scanWithClamd(buffer);
      if (/\bFOUND\b/i.test(response)) {
        return { scanStatus: AttachmentScanStatus.BLOCKED, scanResult: AttachmentScanResult.FAILED };
      }
      if (/\bOK\b/i.test(response)) {
        return { scanStatus: AttachmentScanStatus.CLEAN, scanResult: AttachmentScanResult.PASSED };
      }
      this.logger.warn(`Unexpected ClamAV response: ${response.slice(0, 200)}`);
    } catch (error) {
      this.logger.warn(`ClamAV scan failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    const failClosed = (this.config.get<string>("CLAMAV_FAIL_CLOSED") ?? "false").toLowerCase() === "true";
    return failClosed
      ? { scanStatus: AttachmentScanStatus.BLOCKED, scanResult: AttachmentScanResult.FAILED }
      : { scanStatus: AttachmentScanStatus.PENDING, scanResult: AttachmentScanResult.SKIPPED };
  }

  private scanWithClamd(buffer: Buffer): Promise<string> {
    const host = this.config.get<string>("CLAMAV_HOST") ?? "127.0.0.1";
    const port = Number(this.config.get<string>("CLAMAV_PORT") ?? 3310);
    const timeoutMs = Number(this.config.get<string>("CLAMAV_TIMEOUT_MS") ?? 15_000);

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        socket.destroy(new Error("ClamAV scan timed out."));
      }, timeoutMs);

      socket.on("connect", () => {
        const size = Buffer.alloc(4);
        size.writeUInt32BE(buffer.length, 0);
        socket.write("INSTREAM\n");
        socket.write(size);
        socket.write(buffer);
        socket.write(Buffer.alloc(4));
      });
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      socket.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on("close", () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });
  }
}
