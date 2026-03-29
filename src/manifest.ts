import path from "node:path";
import { RenderManifest } from "./types.js";

export function manifestPath(outputDir: string): string {
  return path.join(outputDir, "manifest.json");
}

export function failedItems(manifest: RenderManifest) {
  return manifest.items.filter((item) => item.status === "failure");
}
