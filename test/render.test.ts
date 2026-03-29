import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { parseCoordinateItems } from "../src/input.js";
import { renderBatch, resolveTileCoordinate } from "../src/render.js";

test("resolveTileCoordinate maps pixel offsets", () => {
  assert.deepEqual(resolveTileCoordinate(3200, 3200), {
    tileX: 100,
    tileY: 100,
    pixelX: 0,
    pixelY: 255
  });
});

test("renderBatch writes previews and manifest", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "osrs-preview-"));
  const items = parseCoordinateItems(JSON.stringify([
    { coordinate: "3200/3200/0", label: "Quest start" },
    { coordinate: "3210/3210/0", label: "Quest step" }
  ]));

  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    const color = url.includes("/0/3/0_100_100.png") ? "#00ff00" : "#0000ff";
    const buffer = await sharp({
      create: { width: 256, height: 256, channels: 4, background: color }
    }).png().toBuffer();

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: { "content-type": "image/png" }
    });
  };

  const manifest = await renderBatch(items, { outputDir: tempDir, fetchImpl });
  assert.equal(manifest.renderCount, 2);
  assert.equal(manifest.failedCount, 0);
  await fs.access(path.join(tempDir, "quest-start-1.png"));
  await fs.access(path.join(tempDir, "quest-step-2.png"));
  await fs.access(path.join(tempDir, "manifest.json"));
});
