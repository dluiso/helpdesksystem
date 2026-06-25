import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AttachmentScanResult, AttachmentScanStatus } from "@prisma/client";
import net from "node:net";

export interface FileScanOutcome {
  scanStatus: AttachmentScanStatus;
  scanResult: AttachmentScanResult;
}

export interface FileScannerHealth {
  enabled: boolean;
  failClosed: boolean;
  endpoint: string;
  reachable: boolean;
  version: string | null;
  error: string | null;
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

  async getScannerHealth(): Promise<FileScannerHealth> {
    const enabled = (this.config.get<string>("CLAMAV_ENABLED") ?? "false").toLowerCase() === "true";
    const failClosed = (this.config.get<string>("CLAMAV_FAIL_CLOSED") ?? "false").toLowerCase() === "true";
    const endpoint = this.clamdEndpointLabel();
    if (!enabled) {
      return { enabled, failClosed, endpoint, reachable: false, version: null, error: "ClamAV is not enabled." };
    }

    try {
      const pong = await this.runClamdCommand("zPING\0");
      if (!/\bPONG\b/i.test(pong)) {
        return { enabled, failClosed, endpoint, reachable: false, version: null, error: `Unexpected ClamAV PING response: ${pong.slice(0, 120)}` };
      }
      const version = await this.runClamdCommand("zVERSION\0");
      return { enabled, failClosed, endpoint, reachable: true, version: version.trim() || null, error: null };
    } catch (error) {
      return { enabled, failClosed, endpoint, reachable: false, version: null, error: error instanceof Error ? error.message : "Unable to reach ClamAV." };
    }
  }

  private scanWithClamd(buffer: Buffer): Promise<string> {
    const connectionOptions = this.clamdConnectionOptions();
    const timeoutMs = Number(this.config.get<string>("CLAMAV_TIMEOUT_MS") ?? 15_000);

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(connectionOptions);
      const chunks: Buffer[] = [];
      let settled = false;
      const timer = setTimeout(() => {
        socket.destroy(new Error("ClamAV scan timed out."));
      }, timeoutMs);

      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };

      socket.on("connect", () => {
        const size = Buffer.alloc(4);
        size.writeUInt32BE(buffer.length, 0);
        socket.write("zINSTREAM\0");
        socket.write(size);
        socket.write(buffer);
        socket.write(Buffer.alloc(4));
      });
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      socket.on("error", (error) => {
        settle(() => reject(error));
      });
      socket.on("close", () => {
        settle(() => resolve(Buffer.concat(chunks).toString("utf8")));
      });
    });
  }

  private runClamdCommand(command: string): Promise<string> {
    const connectionOptions = this.clamdConnectionOptions();
    const timeoutMs = Number(this.config.get<string>("CLAMAV_TIMEOUT_MS") ?? 15_000);

    return new Promise((resolve, reject) => {
      const socket = net.createConnection(connectionOptions);
      const chunks: Buffer[] = [];
      let settled = false;
      const timer = setTimeout(() => {
        socket.destroy(new Error("ClamAV command timed out."));
      }, timeoutMs);

      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };

      socket.on("connect", () => {
        socket.write(command);
        socket.end();
      });
      socket.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      socket.on("error", (error) => {
        settle(() => reject(error));
      });
      socket.on("close", () => {
        settle(() => resolve(Buffer.concat(chunks).toString("utf8").replace(/\0+$/g, "")));
      });
    });
  }

  private clamdConnectionOptions(): net.NetConnectOpts {
    const socketPath = this.config.get<string>("CLAMAV_SOCKET_PATH")?.trim();
    if (socketPath) {
      return { path: socketPath };
    }

    return {
      host: this.config.get<string>("CLAMAV_HOST") ?? "127.0.0.1",
      port: Number(this.config.get<string>("CLAMAV_PORT") ?? 3310)
    };
  }

  private clamdEndpointLabel() {
    const socketPath = this.config.get<string>("CLAMAV_SOCKET_PATH")?.trim();
    if (socketPath) {
      return socketPath;
    }
    return `${this.config.get<string>("CLAMAV_HOST") ?? "127.0.0.1"}:${this.config.get<string>("CLAMAV_PORT") ?? "3310"}`;
  }
}
