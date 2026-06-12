#!/usr/bin/env node
// Invoked by .github/workflows/slow-loop-applied.yml on merge of a slow-loop/*
// PR. Reads the PR body from PR_BODY, the merged PR URL from PR_URL, and the
// Convex prod key from CONVEX_DEPLOY_KEY. Parses the "Consumed comments by
// cluster" section (and the flat "Consumed comment IDs" / "Consumed incident
// IDs" fallbacks) and runs the internal mutations in app/convex/comments.ts,
// app/convex/manualChangesMutations.ts, and app/convex/nextWeekQueueMutations.ts
// via `npx convex run --prod`. Exits 0 even when the body is unparseable; the
// action is best-effort and must not block a merge.
//
// Cluster blocks may also carry `next_week_queue_ids:` (consumed nextWeekQueue
// rows the slow loop decided to drop) and `dislike_ids:` (consumed dishDislikes
// rows). The queue ids are marked `dropped` via the real mutation. The dislike
// ids are parsed tolerantly but NOT yet written back: the `dishDislikes` table
// and its mutation land in slice 7.1, so until then dislike ids are logged and
// left queued. See MAINTENANCE.md §3 and features/design-revamp.md §6.14.
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
 *   manual_change_ids: -
 *   incident_ids: -
 *   next_week_queue_ids: -
 *   dislike_ids: -
 *   ```
 *
 *   ```cluster
 *   outcome: reviewed_no_change
 *   comment_ids: ghi789
 *   manual_change_ids: mno345
 *   incident_ids: jkl012
 *   next_week_queue_ids: q111
 *   dislike_ids: d222
 *   ```
 *
 * Returns {
 *   appliedComments, reviewedNoChangeComments,
 *   appliedManualChanges, reviewedNoChangeManualChanges,
 *   incidents, queueIds, dislikeIds
 * } with deduped ids. Outcome must be one of "applied" or "reviewed_no_change";
 * any other value skips the cluster's comment and manual-change ids and logs a
 * warning.
 *
 * `manual_change_ids`, `next_week_queue_ids`, and `dislike_ids` are all optional
 * in the fence to preserve backward compatibility with PRs authored before the
 * fields existed (`manual_change_ids` predates Stream I; the queue and dislike
 * fields predate slice 9.1). Queue ids and dislike ids are outcome-independent:
 * a consumed queue row is dropped and a consumed dislike is resolved regardless
 * of the cluster's comment/manual-change outcome, so they are collected from
 * every recognized cluster block (no outcome gating).
 */
function parseClusters(body) {
  const appliedComments = new Set();
  const reviewedNoChangeComments = new Set();
  const appliedManualChanges = new Set();
  const reviewedNoChangeManualChanges = new Set();
  const incidents = new Set();
  const queueIds = new Set();
  const dislikeIds = new Set();

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
    const manualChangeIds = parseIdList(fields.manual_change_ids ?? "");
    const incidentIds = parseIdList(fields.incident_ids ?? "");
    const nextWeekQueueIds = parseIdList(fields.next_week_queue_ids ?? "");
    const clusterDislikeIds = parseIdList(fields.dislike_ids ?? "");

    if (outcome === "applied") {
      for (const id of commentIds) appliedComments.add(id);
      for (const id of manualChangeIds) appliedManualChanges.add(id);
    } else if (outcome === "reviewed_no_change") {
      for (const id of commentIds) reviewedNoChangeComments.add(id);
      for (const id of manualChangeIds) reviewedNoChangeManualChanges.add(id);
    } else {
      console.log(
        `[slow-loop-mark-applied] cluster #${clusterCount}: unknown outcome ${JSON.stringify(
          fields.outcome,
        )}; skipping its comment and manual-change ids.`,
      );
    }
    // Incident, queue, and dislike ids are outcome-independent: consumed
    // regardless of the comment/manual-change outcome for the cluster.
    for (const id of incidentIds) incidents.add(id);
    for (const id of nextWeekQueueIds) queueIds.add(id);
    for (const id of clusterDislikeIds) dislikeIds.add(id);
  }

  return {
    appliedComments: [...appliedComments],
    reviewedNoChangeComments: [...reviewedNoChangeComments],
    appliedManualChanges: [...appliedManualChanges],
    reviewedNoChangeManualChanges: [...reviewedNoChangeManualChanges],
    incidents: [...incidents],
    queueIds: [...queueIds],
    dislikeIds: [...dislikeIds],
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
 *   Consumed manual-change IDs: m, n
 *   Consumed incident IDs: d, e
 *   Consumed next-week-queue IDs: q1, q2
 *   Consumed dislike IDs: d1
 * Returns { commentIds, manualChangeIds, incidentIds, queueIds, dislikeIds }.
 * Used only when the per-cluster section is absent; we cannot tell outcome from
 * these, so the action treats all comments AND all manual changes as `applied`
 * (conservative default: a PR that touches files is more likely to have applied
 * than no-change clusters). Queue and dislike rows are outcome-independent, so
 * the flat values map straight through. The queue and dislike flat lines are
 * absent in older PR bodies and read as empty.
 */
function parseFlatLists(body) {
  const commentLine = body.match(/^Consumed comment IDs:\s*(.*)$/im);
  const manualChangeLine = body.match(/^Consumed manual-change IDs:\s*(.*)$/im);
  const incidentLine = body.match(/^Consumed incident IDs:\s*(.*)$/im);
  const queueLine = body.match(/^Consumed next-week-queue IDs:\s*(.*)$/im);
  const dislikeLine = body.match(/^Consumed dislike IDs:\s*(.*)$/im);
  return {
    commentIds: commentLine ? parseIdList(commentLine[1]) : [],
    manualChangeIds: manualChangeLine ? parseIdList(manualChangeLine[1]) : [],
    incidentIds: incidentLine ? parseIdList(incidentLine[1]) : [],
    queueIds: queueLine ? parseIdList(queueLine[1]) : [],
    dislikeIds: dislikeLine ? parseIdList(dislikeLine[1]) : [],
  };
}

const clusters = parseClusters(prBody);
console.log(`[slow-loop-mark-applied] parsed ${clusters.clusterCount} cluster block(s)`);

let appliedCommentIds = clusters.appliedComments;
let reviewedNoChangeCommentIds = clusters.reviewedNoChangeComments;
let appliedManualChangeIds = clusters.appliedManualChanges;
let reviewedNoChangeManualChangeIds = clusters.reviewedNoChangeManualChanges;
let incidentIds = clusters.incidents;
let queueIds = clusters.queueIds;
let dislikeIds = clusters.dislikeIds;

if (clusters.clusterCount === 0) {
  const flat = parseFlatLists(prBody);
  if (
    flat.commentIds.length === 0 &&
    flat.manualChangeIds.length === 0 &&
    flat.incidentIds.length === 0 &&
    flat.queueIds.length === 0 &&
    flat.dislikeIds.length === 0
  ) {
    console.log("[slow-loop-mark-applied] no cluster blocks and no flat ID lines; exiting clean.");
    process.exit(0);
  }
  console.log(
    `[slow-loop-mark-applied] cluster blocks absent; falling back to flat lists. Treating ${flat.commentIds.length} comment(s) and ${flat.manualChangeIds.length} manual-change(s) as applied.`,
  );
  appliedCommentIds = flat.commentIds;
  reviewedNoChangeCommentIds = [];
  appliedManualChangeIds = flat.manualChangeIds;
  reviewedNoChangeManualChangeIds = [];
  incidentIds = flat.incidentIds;
  queueIds = flat.queueIds;
  dislikeIds = flat.dislikeIds;
}

console.log(
  `[slow-loop-mark-applied] comments: applied=${appliedCommentIds.length} reviewed_no_change=${reviewedNoChangeCommentIds.length}; manual-changes: applied=${appliedManualChangeIds.length} reviewed_no_change=${reviewedNoChangeManualChangeIds.length}; incidents=${incidentIds.length}; next-week-queue=${queueIds.length}; dislikes=${dislikeIds.length}`,
);

// Dislikes are parsed for forward-compatibility but NOT written back here: the
// `dishDislikes` table and its mark-applied mutation land in slice 7.1. Until
// then this is a guarded no-op that logs the ids so a slow-loop PR can already
// list them; consumed dislikes stay queued and the 7.1 follow-up wires the real
// mutation. See MAINTENANCE.md §3 and features/design-revamp.md §6.14.
if (dislikeIds.length > 0) {
  console.log(
    `[slow-loop-mark-applied] dislike ids parsed but NOT marked (dishDislikes table lands in slice 7.1): ${dislikeIds.join(", ")}`,
  );
}

if (DRY_RUN) {
  console.log("[slow-loop-mark-applied] dry-run; not calling Convex.");
  console.log(
    JSON.stringify({
      appliedCommentIds,
      reviewedNoChangeCommentIds,
      appliedManualChangeIds,
      reviewedNoChangeManualChangeIds,
      incidentIds,
      queueIds,
      dislikeIds,
      prUrl,
    }),
  );
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

if (appliedCommentIds.length > 0) {
  runConvex("comments:markCommentsApplied", {
    commentIds: appliedCommentIds,
    resolvedPr: prUrl,
  });
}
if (reviewedNoChangeCommentIds.length > 0) {
  runConvex("comments:markCommentsReviewedNoChange", {
    commentIds: reviewedNoChangeCommentIds,
    resolvedPr: prUrl,
  });
}
if (appliedManualChangeIds.length > 0) {
  runConvex("manualChangesMutations:markManualChangesApplied", {
    manualChangeIds: appliedManualChangeIds,
    resolvedPr: prUrl,
  });
}
if (reviewedNoChangeManualChangeIds.length > 0) {
  runConvex("manualChangesMutations:markManualChangesReviewedNoChange", {
    manualChangeIds: reviewedNoChangeManualChangeIds,
    resolvedPr: prUrl,
  });
}
if (incidentIds.length > 0) {
  runConvex("comments:markIncidentsResolved", {
    incidentIds,
    resolvedPr: prUrl,
  });
}
if (queueIds.length > 0) {
  runConvex("nextWeekQueueMutations:markQueueDropped", {
    queueIds,
    resolvedPr: prUrl,
  });
}

console.log("[slow-loop-mark-applied] done.");
