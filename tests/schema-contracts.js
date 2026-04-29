#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function enumValues(schema, property) {
  return schema.properties[property].enum;
}

const agentRun = readJson("schemas/agent-run.schema.json");
assert.ok(enumValues(agentRun, "status").includes("analysis-confirmed"));
assert.ok(enumValues(agentRun, "status").includes("batch-planned"));
assert.ok(enumValues(agentRun, "status").includes("fix-in-progress"));
assert.ok(enumValues(agentRun, "status").includes("fix-completed"));
assert.ok(enumValues(agentRun, "status").includes("closed"));
assert.ok(!enumValues(agentRun, "status").includes("merge-gate"));

const batchPlan = readJson("schemas/batch-plan.schema.json");
assert.ok(batchPlan.required.includes("batchId"));
assert.ok(batchPlan.required.includes("sourceIssues"));
for (const status of ["draft", "approved", "active", "closed"]) {
  assert.ok(
    enumValues(batchPlan, "status").includes(status),
    `batch-plan status should include ${status}`
  );
}
assert.ok(!enumValues(batchPlan, "status").includes("merge-gate"));
const sourceIssue = batchPlan.properties.sourceIssues.items;
assert.ok(sourceIssue.required.includes("selectedOption"));
const wave = batchPlan.properties.waves.items;
assert.ok(wave.required.includes("status"));
assert.ok(wave.required.includes("branch"));
assert.ok(wave.required.includes("worktree"));
assert.ok(wave.properties.status.enum.includes("planned"));
assert.ok(!wave.properties.status.enum.includes("blocked"));
const blocked = batchPlan.properties.blocked.items;
assert.ok(blocked.properties.reason.enum.includes("analysis-awaiting-confirmation"));
assert.ok(Object.hasOwn(blocked.properties, "nextAction"));

const fixReport = readJson("schemas/fix-report.schema.json");
assert.ok(fixReport.required.includes("declaredTouchedFiles"));
assert.ok(fixReport.required.includes("actualTouchedFiles"));
assert.ok(fixReport.required.includes("selectedOption"));
assert.ok(enumValues(fixReport, "status").includes("scope-change-requested"));
assert.ok(Object.hasOwn(fixReport.properties, "wave"));

const locks = readJson("schemas/active-file-locks.schema.json");
assert.ok(locks.required.includes("batchId"));
assert.ok(locks.required.includes("locks"));
const lockStatusEnum = locks.properties.locks.items.properties.status.enum;
for (const status of ["planned", "active", "completed"]) {
  assert.ok(lockStatusEnum.includes(status), `lock status should include ${status}`);
}
assert.ok(!lockStatusEnum.includes("released"));

process.stdout.write("ok - schema contracts\n");
