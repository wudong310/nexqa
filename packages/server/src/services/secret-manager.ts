/**
 * O5: AES-256-GCM 加密管理器
 *
 * - 加密: encrypt(plaintext) → "enc:v1:aes256gcm:base64..."
 * - 解密: decrypt(ciphertext) → plaintext
 * - 脱敏: mask(value) → "abc***"
 *
 * 密钥来源:
 *   1. 环境变量 NEXQA_SECRET_KEY (hex)
 *   2. 自动生成 data/.secret-key 文件
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "./storage.js";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:aes256gcm:";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function loadOrCreateKey(): Buffer {
  // 1. 优先读环境变量
  const envKey = process.env.NEXQA_SECRET_KEY;
  if (envKey) {
    return Buffer.from(envKey, "hex");
  }

  // 2. 从 data/.secret-key 文件读取/创建
  const dataDir = getDataDir();
  const keyPath = join(dataDir, ".secret-key");

  if (existsSync(keyPath)) {
    return readFileSync(keyPath);
  }

  // 自动生成
  mkdirSync(dataDir, { recursive: true });
  const key = randomBytes(32);
  writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

let _key: Buffer | null = null;
function getKey(): Buffer {
  if (!_key) _key = loadOrCreateKey();
  return _key;
}

/** 加密明文 → 密文字符串 (带 prefix) */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // iv(16) + authTag(16) + encrypted
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return PREFIX + combined.toString("base64");
}

/** 解密密文 → 明文。未加密的值(无 prefix)直接返回(向后兼容) */
export function decrypt(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) {
    return ciphertext; // 未加密的明文，向后兼容
  }
  const key = getKey();
  const data = Buffer.from(ciphertext.slice(PREFIX.length), "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8");
}

/** 脱敏: 前 3 字符 + "***"。空值或短值返回 "***" */
export function mask(value: string): string {
  if (!value || value.length <= 3) return "***";
  return value.slice(0, 3) + "***";
}

/** 判断一个 value 是否是加密格式 */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}
