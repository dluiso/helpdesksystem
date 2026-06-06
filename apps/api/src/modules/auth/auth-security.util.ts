import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function hashSecurityToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function generateSecurityToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

export function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => `${randomBytes(4).toString("hex")}-${randomBytes(4).toString("hex")}`);
}

export function verifyTotpCode(secret: string, code: string) {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) {
    return false;
  }

  const nowStep = Math.floor(Date.now() / 1000 / 30);
  return [-1, 0, 1].some((offset) => constantTimeEqual(totp(secret, nowStep + offset), normalized));
}

export function buildOtpAuthUrl(input: { issuer: string; accountName: string; secret: string }) {
  const issuer = encodeURIComponent(input.issuer);
  const account = encodeURIComponent(input.accountName);
  return `otpauth://totp/${issuer}:${account}?secret=${input.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

export function encryptSecret(value: string, secret: string) {
  const key = encryptionKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(value: string, secret: string) {
  const [version, ivText, tagText, encryptedText] = value.split(":");
  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    throw new UnauthorizedException("Stored MFA secret is invalid.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

function encryptionKey(secret: string) {
  if (!secret || secret.length < 32) {
    throw new BadRequestException("SESSION_SECRET must be configured before MFA can be used.");
  }
  return createHash("sha256").update(secret).digest();
}

function base32Encode(buffer: Buffer) {
  let bits = "";
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, "0");
  }
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

function base32Decode(value: string) {
  const normalized = value.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = "";
  for (const char of normalized) {
    const valueIndex = BASE32_ALPHABET.indexOf(char);
    if (valueIndex === -1) {
      throw new UnauthorizedException("MFA secret is invalid.");
    }
    bits += valueIndex.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string, step: number) {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  counter.writeUInt32BE(step >>> 0, 4);
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1000000).padStart(6, "0");
}

function constantTimeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
