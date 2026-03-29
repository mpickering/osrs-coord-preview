import fs from "node:fs/promises";
import path from "node:path";
import * as artifact from "@actions/artifact";
import * as core from "@actions/core";
import { postOrUpdateComment } from "./comment.js";
import { parseCoordinateItems, resolveOutputDir } from "./input.js";
import { failedItems } from "./manifest.js";
import { renderBatch } from "./render.js";

export interface ActionOptions {
  coordinatesRaw: string;
  comment: boolean;
  artifactName: string;
  outputDir: string;
  token?: string;
}

export async function runAction(options: ActionOptions): Promise<void> {
  // The action always renders previews first, then publishes them and only fails at the
  // end if any requested coordinate could not be rendered.
  const items = parseCoordinateItems(options.coordinatesRaw);
  const outputDir = resolveOutputDir(options.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  const manifest = await renderBatch(items, { outputDir });
  const manifestPath = path.join(outputDir, "manifest.json");

  core.setOutput("manifest_path", manifestPath);
  core.setOutput("artifact_name", options.artifactName);
  core.setOutput("render_count", String(manifest.renderCount));
  core.setOutput("failed_count", String(manifest.failedCount));
  core.summary.addHeading("OSRS coordinate previews");
  core.summary.addRaw(`Rendered ${manifest.renderCount} preview(s); ${manifest.failedCount} failure(s).`);
  await core.summary.write();

  const client = new artifact.DefaultArtifactClient();
  const files = await collectFiles(outputDir);
  await client.uploadArtifact(options.artifactName, files, outputDir, {
    retentionDays: 7
  });

  if (options.comment) {
    if (!options.token) {
      throw new Error("Commenting is enabled but GITHUB_TOKEN is not available.");
    }
    await postOrUpdateComment(options.token, manifest);
  }

  const failures = failedItems(manifest);
  if (failures.length > 0) {
    throw new Error(`Failed to render ${failures.length} coordinate preview(s).`);
  }
}

async function collectFiles(outputDir: string): Promise<string[]> {
  const entries = await fs.readdir(outputDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(outputDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}
