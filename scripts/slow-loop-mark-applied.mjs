#!/usr/bin/env node
// Invoked by .github/workflows/slow-loop-applied.yml on merge of a slow-loop/*
// PR. Reads the PR body from PR_BODY, the merged PR URL from PR_URL, and the
// Convex prod key from CONVEX_DEPLOY_KEY. Parses the "Consumed comments by
// cluster" section (and the flat "Consumed comment IDs" / "Consumed incident
// IDs" fallbacks) and runs the internal mutations in app/convex/comments.ts
// via `npx convex run --prod`. Exits 0 even when the body is unparseable; the
// action is best-effort and must not block a merge.
//
// Run locally for unit testing:
//   PR_BODY="$(cat sample-pr-body.md)" PR_URL=https://example/pr/1 \
//     CONVEX_DEPLOY_KEY=dev-only node scripts/slow-loop-mark-applied.mjs
// (The --dry-run flag skips the npx convex run calls so a local invocation
// only prints the parse output.)

import { spawnSync } from "node:child_process";

const DRY_RUN = process.argv.includes("--dry-run");

const prBody = process.env.PR_BODY ?? "";
const prUrl = process.env.PR_URL ?? "";
const convexKey = process.env.CONVEX_DEPLOY_KEY ?? "";

if (!prBody.trim()) {
  console.log("[slow-loop-mark-applied] PR body is empty; nothing to do.");
  process.exit(0);
}

if (!DRY_RUN && !convexKey) {
  console.log("[slow-loop-mark-applied] CONVEX_DEPLOY_KEY missing; cannot call Convex.");
  process.exit(0);
}

/**
 * Parses the per-cluster section. Expected shape, repeated per cluster:
 *
 *   ## Consumed comments by cluster
 *
 *   ```cluster
 *   outcome: applied
 *   comment_ids: abc123, def456
 *   incident_ids: -
 *   ```
 *
 *   ```cluster
 *   outcome: reviewed_no_change
 *   comment_ids: ghi789
 *   incident_ids: jkl012
 *   ```
 *
 * Returns { applied: string[], reviewedNoChange: string[], incidents: string[] }
 * with deduped ids. Outcome must be one of "applied" or "reviewed_no_change";
 * any other value skips the cluster and logs a warning.
 */
function parseClusters(body) {
  const applied = new Set();
  const reviewedNoChange = new Set();
  const incidents = new Set();

  const re = /```cluster\s*\n([\s\S]*?)```/g;
  let match;
  let clusterCount = 0;
  while ((match = re.exec(body)) !== null) {
    clusterCount += 1;
    const block = match[1];
    const fields = {};
    for (const line of block.split("\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      fields[key] = value;
    }
    const outcome = (fields.outcome ?? "").toLowerCase();
    const commentIds = parseIdList(fields.comment_ids ?? "");
    const incidentIds = parseIdList(fields.incident_ids ?? "");

    if (outcome === "applied") {
      for (const id of commentIds) applied.add(id);
    } else if (outcome === "reviewed_no_change") {
      for (const id of commentIds) reviewedNoChange.add(id);
    } else {
      console.log(
        `[slow-loop-mark-applied] cluster #${clusterCount}: unknown outcome ${JSON.stringify(
          fields.outcome,
        )}; skipping its comment ids.`,
      );
    }
    for (const id of incidentIds) incidents.add(id);
  }

  return {
    applied: [...applied],
    reviewedNoChange: [...reviewedNoChange],
    incidents: [...incidents],
    clusterCount,
  };
}

function parseIdList(raw) {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-") return [];
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "-");
}

/**
 * Fallback parser. Reads the flat lines
 *   Consumed comment IDs: a, b, c
 *   Consumed incident IDs: d, e
 * Returns { commentIds, incidentIds }. Used only when the per-cluster section
 * is absent; we cannot tell outcome from these, so the action treats all
 * comments as `applied` (conservative default: a PR that touches files is more
 * likely to have applied than no-change clusters).
 */
function parseFlatLists(body) {
  const commentLine = body.match(/^Consumed comment IDs:\s*(.*)$/im);
  const incidentLine = body.match(/^Consumed incident IDs:\s*(.*)$/im);
  return {
    commentIds: commentLine ? parseIdList(commentLine[1]) : [],
    incidentIds: incidentLine ? parseIdList(incidentLine[1]) : [],
  };
}

const clusters = parseClusters(prBody);
console.log(`[slow-loop-mark-applied] parsed ${clusters.clusterCount} cluster block(s)`);

let appliedIds = clusters.applied;
let reviewedNoChangeIds = clusters.reviewedNoChange;
let incidentIds = clusters.incidents;

if (clusters.clusterCount === 0) {
  const flat = parseFlatLists(prBody);
  if (flat.commentIds.length === 0 && flat.incidentIds.length === 0) {
    console.log("[slow-loop-mark-applied] no cluster blocks and no flat ID lines; exiting clean.");
    process.exit(0);
  }
  console.log(
    `[slow-loop-mark-applied] cluster blocks absent; falling back to flat lists. Treating ${flat.commentIds.length} comment(s) as applied.`,
  );
  appliedIds = flat.commentIds;
  reviewedNoChangeIds = [];
  incidentIds = flat.incidentIds;
}

console.log(
  `[slow-loop-mark-applied] applied=${appliedIds.length} reviewed_no_change=${reviewedNoChangeIds.length} incidents=${incidentIds.length}`,
);

if (DRY_RUN) {
  console.log("[slow-loop-mark-applied] dry-run; not calling Convex.");
  console.log(JSON.stringify({ appliedIds, reviewedNoChangeIds, incidentIds, prUrl }));
  process.exit(0);
}

function runConvex(fnName, args) {
  const argsJson = JSON.stringify(args);
  console.log(`[slow-loop-mark-applied] convex run ${fnName} ${argsJson}`);
  const res = spawnSync("npx", ["convex", "run", "--prod", fnName, argsJson], {
    stdio: "inherit",
    env: { ...process.env, CONVEX_DEPLOY_KEY: convexKey },
  });
  if (res.status !== 0) {
    console.log(
      `[slow-loop-mark-applied] ${fnName} exited with status ${res.status}; continuing (best-effort).`,
    );
  }
}

if (appliedIds.length > 0) {
  runConvex("comments:markCommentsApplied", {
    commentIds: appliedIds,
    resolvedPr: prUrl,
  });
}
if (reviewedNoChangeIds.length > 0) {
  runConvex("comments:markCommentsReviewedNoChange", {
    commentIds: reviewedNoChangeIds,
    resolvedPr: prUrl,
  });
}
if (incidentIds.length > 0) {
  runConvex("comments:markIncidentsResolved", {
    incidentIds,
    resolvedPr: prUrl,
  });
}

console.log("[slow-loop-mark-applied] done.");
