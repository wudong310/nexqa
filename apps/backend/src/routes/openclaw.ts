import { randomUUID } from "node:crypto";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Hono } from "hono";
import { safeFetch } from "../services/safe-fetch.js";
import { storage } from "../services/storage.js";

interface OssConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region?: string;
}

// 默认 OSS 配置（外网 endpoint，用于本地开发机）
const DEFAULT_OSS_CONFIG: OssConfig = {
  endpoint: "https://s3.cn-north-1.jdcloud-oss.com",
  accessKey: "AC84CF36FE52403EFAA604D44008DB5F",
  secretKey: "FC2CE9BAA6A493694CB7FEC75B57B7CF",
  bucket: "joyos",
  region: "cn-north-1",
};

// 图片上传路径前缀
const UPLOAD_PREFIX = "dev/claw-runner/temp-files";

async function getOssConfig(): Promise<OssConfig> {
  // 优先读取用户自定义配置，没有则用默认配置
  const raw = await storage.readRaw("oss.json");
  if (raw) {
    try {
      return JSON.parse(raw) as OssConfig;
    } catch {
      // 解析失败，用默认配置
    }
  }
  return DEFAULT_OSS_CONFIG;
}

function createS3Client(config: OssConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region || "us-east-1",
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true,
  });
}

export const openclawRoutes = new Hono()
  .post("/proxy-sign-challenge", async (c) => {
    const body = await c.req.json<{
      clawRunnerUrl: string;
      nonce: string;
    }>();
    const { clawRunnerUrl, nonce } = body;
    if (!clawRunnerUrl || !nonce) {
      return c.json({ error: "Missing clawRunnerUrl or nonce" }, 400);
    }
    // Force HTTPS to avoid HTTP→HTTPS 301 redirect which downgrades POST to GET
    const baseUrl = clawRunnerUrl.replace(/\/$/, "").replace(/^http:\/\//i, "https://");
    const url = `${baseUrl}/api/gateway/signChallenge`;
    try {
      const res = await safeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce }),
        forceHttps: true,
        timeout: 10000,
      });
      const data = await res.json();
      return c.json(data, res.status as 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "proxy fetch failed";
      return c.json({ error: msg }, 502);
    }
  })
  .get("/oss-config", async (c) => {
    const config = await getOssConfig();
    // Return sanitized config (no secrets)
    return c.json({
      configured: true,
      endpoint: config.endpoint,
      bucket: config.bucket,
      region: config.region,
    });
  })
  .post("/oss-config/update", async (c) => {
    const body = await c.req.json<OssConfig>();
    await storage.writeRaw("oss.json", JSON.stringify(body, null, 2));
    return c.json({ ok: true });
  })
  .post("/upload-image", async (c) => {
    const config = await getOssConfig();

    const formData = await c.req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return c.json({ error: "缺少文件" }, 400);
    }

    const timestamp = Date.now();
    const randomId = randomUUID().slice(0, 8);
    const originalName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${UPLOAD_PREFIX}/${timestamp}-${randomId}-${originalName}`;

    const s3 = createS3Client(config);
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: buffer,
          ContentType: file.type || "application/octet-stream",
        }),
      );

      // bucket 非公开读取，生成预签名 URL（7 天有效）
      const getCommand = new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      });
      const presignedUrl = await getSignedUrl(s3, getCommand, {
        expiresIn: 7 * 24 * 60 * 60,
      });

      return c.json({
        url: presignedUrl,
        key,
        mime: file.type,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "上传失败";
      return c.json({ error: msg }, 500);
    }
  });
