import * as core from "@actions/core";
import * as github from "@actions/github";
import { RenderManifest } from "./types.js";

const COMMENT_MARKER = "<!-- osrs-coordinate-preview -->";

export function buildCommentBody(manifest: RenderManifest): string {
  const lines = [
    COMMENT_MARKER,
    "## OSRS coordinate previews",
    "",
    `Rendered ${manifest.renderCount} preview(s); ${manifest.failedCount} failure(s).`,
    "",
    "| Item | Coordinate | Source | Status |",
    "| --- | --- | --- | --- |"
  ];

  for (const item of manifest.items) {
    const title = item.label ?? item.id;
    const source = item.source ?? "";
    const status = item.status === "success" ? "rendered" : `failed: ${item.error}`;
    lines.push(`| ${escapeCell(title)} | ${escapeCell(item.coordinate)} | ${escapeCell(source)} | ${escapeCell(status)} |`);
  }

  lines.push("");
  for (const item of manifest.items) {
    if (item.status !== "success" || !item.imageUrl) {
      continue;
    }
    lines.push(`### ${item.label ?? item.id}`);
    lines.push("");
    lines.push(`![${item.label ?? item.id}](${item.imageUrl})`);
    lines.push("");
    lines.push(`[Open image](${item.imageUrl})`);
    lines.push("");
  }

  lines.push("Images are hosted by the configured renderer service.");
  return lines.join("\n");
}

export async function postOrUpdateComment(token: string, manifest: RenderManifest): Promise<void> {
  const context = github.context;
  if (!context.issue.number) {
    core.info("Commenting requested, but this workflow is not running in a pull request context.");
    return;
  }

  const octokit = github.getOctokit(token);
  const body = buildCommentBody(manifest);
  const { owner, repo } = context.repo;
  const issue_number = context.issue.number;

  const comments = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number,
    per_page: 100
  });

  const existing = comments.data.find((comment) => comment.body?.includes(COMMENT_MARKER));
  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body
    });
    return;
  }

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number,
    body
  });
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
