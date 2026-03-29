import fs from "node:fs/promises";
import path from "node:path";
import * as artifact from "@actions/artifact";
import * as core from "@actions/core";
import { postOrUpdateComment } from "./comment.js";
import { parseCoordinateItems, resolveOutputDir } from "./input.js";
import { failedItems } from "./manifest.js";
import { uploadImageTo0x0 } from "./publish.js";
import { renderBatch } from "./render.js";
import { RenderSuccess } from "./types.js";

export interface ActionOptions {
  coordinatesRaw: string;
  comment: boolean;
  uploadTo0x0: boolean;
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
  await uploadPerImageArtifacts(client, manifest);
  if (options.uploadTo0x0) {
    await uploadPerImageLinks(manifest);
  }

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

async function uploadPerImageArtifacts(client: artifact.DefaultArtifactClient, manifest: Awaited<ReturnType<typeof renderBatch>>): Promise<void> {
  const runId = process.env.GITHUB_RUN_ID;
  const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const repository = process.env.GITHUB_REPOSITORY;

  for (const item of manifest.items) {
    if (item.status !== "success") {
      continue;
    }

    const artifactName = `preview-${item.id}`;
    const response = await client.uploadArtifact(artifactName, [item.imagePath], path.dirname(item.imagePath), {
      retentionDays: 7
    });

    const successItem = item as RenderSuccess;
    successItem.artifactName = artifactName;
    if (response.id && runId && repository) {
      successItem.artifactUrl = `${serverUrl}/${repository}/actions/runs/${runId}/artifacts/${response.id}`;
    }
  }
}

async function uploadPerImageLinks(manifest: Awaited<ReturnType<typeof renderBatch>>): Promise<void> {
  for (const item of manifest.items) {
    if (item.status !== "success") {
      continue;
    }

    const successItem = item as RenderSuccess;
    try {
      successItem.publishedImageUrl = await uploadImageTo0x0(successItem.imagePath, successItem.imageName);
    } catch (error) {
      core.warning(`Failed to publish ${successItem.imageName} to 0x0: ${(error as Error).message}`);
    }
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
