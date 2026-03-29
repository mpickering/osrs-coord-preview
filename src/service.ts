import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import { parseCoordinateItems } from "./input.js";
import { renderBatch } from "./render.js";
import { RenderManifest, RenderResult, RenderServiceResponse, RenderSuccess } from "./types.js";

interface ServiceConfig {
  publishMode: "gcs" | "local";
  bucketName?: string;
  publicBaseUrl?: string;
  localPublishDir?: string;
}

export async function handleRenderRequest(rawBody: string): Promise<RenderServiceResponse> {
  const items = parseCoordinateItems(rawBody);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "osrs-render-"));
  const manifest = await renderBatch(items, { outputDir: tempDir });
  const config = loadServiceConfig();

  for (const item of manifest.items) {
    if (item.status !== "success") {
      continue;
    }
    item.imageUrl = await publishRenderedImage(item, rawBody, config);
    delete item.imagePath;
    delete item.imageName;
  }

  return {
    renderCount: manifest.renderCount,
    failedCount: manifest.failedCount,
    items: manifest.items
  };
}

function loadServiceConfig(): ServiceConfig {
  const publishMode = process.env.PUBLISH_MODE === "local" ? "local" : "gcs";
  return {
    publishMode,
    bucketName: process.env.GCS_BUCKET,
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
    localPublishDir: process.env.LOCAL_PUBLISH_DIR
  };
}

async function publishRenderedImage(item: RenderSuccess, rawBody: string, config: ServiceConfig): Promise<string> {
  if (!item.imagePath || !item.imageName) {
    throw new Error(`Rendered image missing local path for ${item.id}`);
  }

  const objectName = buildObjectName(item, rawBody);
  if (config.publishMode === "local") {
    if (!config.localPublishDir || !config.publicBaseUrl) {
      throw new Error("LOCAL_PUBLISH_DIR and PUBLIC_BASE_URL are required for local publish mode.");
    }
    const destination = path.join(config.localPublishDir, objectName);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(item.imagePath, destination);
    return `${trimTrailingSlash(config.publicBaseUrl)}/${objectName}`;
  }

  if (!config.bucketName) {
    throw new Error("GCS_BUCKET is required for GCS publish mode.");
  }

  const storage = new Storage();
  const bucket = storage.bucket(config.bucketName);
  await bucket.upload(item.imagePath, {
    destination: objectName,
    metadata: {
      contentType: "image/png",
      cacheControl: "public, max-age=31536000, immutable"
    }
  });
  return `https://storage.googleapis.com/${config.bucketName}/${objectName}`;
}

function buildObjectName(item: RenderSuccess, rawBody: string): string {
  const payloadHash = BunHash.hash(`${rawBody}:${item.id}`);
  return `renders/${payloadHash}/${item.id}.png`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

class BunHash {
  static hash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }
}
