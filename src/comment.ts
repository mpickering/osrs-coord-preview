import * as core from "@actions/core";
import * as github from "@actions/github";
import { RenderManifest } from "./types.js";

const COMMENT_MARKER = "<!-- osrs-coordinate-preview -->";
const COMMENT_IMAGE_WIDTH = 220;

export function buildCommentBody(manifest: RenderManifest): string {
  const lines = [
    COMMENT_MARKER,
    "## OSRS coordinate previews",
    "",
    `Rendered ${pluralize(manifest.renderCount, "preview")}; ${pluralize(manifest.failedCount, "failure")}.`,
    "",
    "| Preview | Item | Coordinate | Source |",
    "| --- | --- | --- | --- |"
  ];

  for (const item of manifest.items) {
    const title = item.label ?? item.id;
    const source = item.source ?? "";
    const preview = item.status === "success" && item.imageUrl
      ? `<a href="${item.imageUrl}"><img src="${item.imageUrl}" alt="${escapeAttribute(title)}" width="${COMMENT_IMAGE_WIDTH}" /></a>`
      : escapeCell(item.status === "failure" ? `failed: ${item.error}` : "");
    lines.push(`| ${preview} | ${escapeCell(title)} | ${escapeCell(item.coordinate)} | ${escapeCell(source)} |`);
  }

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

function escapeAttribute(value: string): string {
  return value.replace(/"/g, "&quot;");
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
