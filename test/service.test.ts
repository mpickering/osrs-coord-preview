import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { handleRenderRequest } from "../src/service.js";

test("handleRenderRequest publishes local URLs in local mode", async () => {
  const publishDir = await fs.mkdtemp(path.join(os.tmpdir(), "osrs-publish-"));
  process.env.PUBLISH_MODE = "local";
  process.env.LOCAL_PUBLISH_DIR = publishDir;
  process.env.PUBLIC_BASE_URL = "http://127.0.0.1:8080/static";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const buffer = await sharp({
      create: { width: 256, height: 256, channels: 4, background: "#00ff00" }
    }).png().toBuffer();
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: { "content-type": "image/png" }
    });
  };

  try {
    const response = await handleRenderRequest(JSON.stringify([
      { coordinate: "3200/3200/0", label: "Quest start" }
    ]));

    assert.equal(response.renderCount, 1);
    assert.equal(response.failedCount, 0);
    assert.match(response.items[0].status, /success/);
    if (response.items[0].status === "success") {
      assert.match(response.items[0].imageUrl ?? "", /^http:\/\/127\.0\.0\.1:8080\/static\//);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
