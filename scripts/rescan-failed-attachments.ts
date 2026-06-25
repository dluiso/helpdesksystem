import { AttachmentScanResult, AttachmentScanStatus, FileStorageProvider, PrismaClient } from "@prisma/client";
import { readFile } from "fs/promises";
import net from "node:net";
import path from "path";

const prisma = new PrismaClient();
const batchLimit = Number(process.env.RESCAN_ATTACHMENT_LIMIT ?? 200);

type ScanOutcome = {
  scanStatus: AttachmentScanStatus;
  scanResult: AttachmentScanResult;
};

type StoredAttachment = {
  id: string;
  originalFilename: string;
  storageProvider: FileStorageProvider;
  storageKey: string;
};

async function main() {
  if ((process.env.CLAMAV_ENABLED ?? "false").toLowerCase() !== "true") {
    throw new Error("CLAMAV_ENABLED must be true before rescanning attachments.");
  }

  const [ticketAttachments, eventAttachments] = await Promise.all([
    prisma.ticketAttachment.findMany({
      where: {
        scanStatus: AttachmentScanStatus.BLOCKED,
        scanResult: AttachmentScanResult.FAILED,
        deletedAt: null
      },
      select: {
        id: true,
        originalFilename: true,
        storageProvider: true,
        storageKey: true
      },
      take: batchLimit,
      orderBy: { createdAt: "desc" }
    }),
    prisma.eventServiceAttachment.findMany({
      where: {
        scanStatus: AttachmentScanStatus.BLOCKED,
        scanResult: AttachmentScanResult.FAILED,
        deletedAt: null
      },
      select: {
        id: true,
        originalFilename: true,
        storageProvider: true,
        storageKey: true
      },
      take: batchLimit,
      orderBy: { createdAt: "desc" }
    })
  ]);

  let rescanned = 0;
  let cleaned = 0;
  let blocked = 0;
  let skipped = 0;

  for (const attachment of ticketAttachments) {
    const result = await rescanAttachment(attachment);
    if (!result) {
      skipped += 1;
      continue;
    }
    await prisma.ticketAttachment.update({
      where: { id: attachment.id },
      data: result
    });
    rescanned += 1;
    cleaned += result.scanStatus === AttachmentScanStatus.CLEAN ? 1 : 0;
    blocked += result.scanStatus === AttachmentScanStatus.BLOCKED ? 1 : 0;
  }

  for (const attachment of eventAttachments) {
    const result = await rescanAttachment(attachment);
    if (!result) {
      skipped += 1;
      continue;
    }
    await prisma.eventServiceAttachment.update({
      where: { id: attachment.id },
      data: result
    });
    rescanned += 1;
    cleaned += result.scanStatus === AttachmentScanStatus.CLEAN ? 1 : 0;
    blocked += result.scanStatus === AttachmentScanStatus.BLOCKED ? 1 : 0;
  }

  console.log(`Rescan complete. rescanned=${rescanned} cleaned=${cleaned} blocked=${blocked} skipped=${skipped}`);
}

async function rescanAttachment(attachment: StoredAttachment): Promise<ScanOutcome | null> {
  if (attachment.storageProvider !== FileStorageProvider.LOCAL) {
    console.warn(`Skipping non-local attachment ${attachment.id} (${attachment.originalFilename}).`);
    return null;
  }

  try {
    const buffer = await readFile(resolveStorageKey(attachment.storageKey));
    return await scanBuffer(buffer);
  } catch (error) {
    console.warn(`Unable to rescan ${attachment.id} (${attachment.originalFilename}): ${error instanceof Error ? error.message : "unknown error"}`);
    return {
      scanStatus: AttachmentScanStatus.BLOCKED,
      scanResult: AttachmentScanResult.FAILED
    };
  }
}

function resolveStorageKey(storageKey: string): string {
  const storageRoot = process.env.LOCAL_STORAGE_PATH ?? "./storage/local";
  const basePath = path.resolve(process.cwd(), storageRoot);
  const absolutePath = path.resolve(basePath, storageKey);
  const relativePath = path.relative(basePath, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid storage key.");
  }

  return absolutePath;
}

async function scanBuffer(buffer: Buffer): Promise<ScanOutcome> {
  const response = await scanWithClamd(buffer);
  if (/\bFOUND\b/i.test(response)) {
    return {
      scanStatus: AttachmentScanStatus.BLOCKED,
      scanResult: AttachmentScanResult.FAILED
    };
  }
  if (/\bOK\b/i.test(response)) {
    return {
      scanStatus: AttachmentScanStatus.CLEAN,
      scanResult: AttachmentScanResult.PASSED
    };
  }

  throw new Error(`Unexpected ClamAV response: ${response.slice(0, 200)}`);
}

function scanWithClamd(buffer: Buffer): Promise<string> {
  const timeoutMs = Number(process.env.CLAMAV_TIMEOUT_MS ?? 15_000);

  return new Promise((resolve, reject) => {
    const socketPath = process.env.CLAMAV_SOCKET_PATH?.trim();
    const socket = socketPath
      ? net.createConnection({ path: socketPath })
      : net.createConnection({
          host: process.env.CLAMAV_HOST ?? "127.0.0.1",
          port: Number(process.env.CLAMAV_PORT ?? 3310)
        });
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
    socket.on("error", (error) => settle(() => reject(error)));
    socket.on("close", () => settle(() => resolve(Buffer.concat(chunks).toString("utf8"))));
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
