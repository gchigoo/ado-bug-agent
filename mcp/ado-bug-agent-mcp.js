#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
const SERVER_VERSION = (() => {
  try {
    return require("../package.json").version || "0.0.0";
  } catch (_error) {
    return "0.0.0";
  }
})();
const API_VERSION = "7.1";
const COMMENT_API_VERSION = "7.1-preview.3";
const DEFAULT_IMAGE_LIMIT = 5;
const MAX_IMAGE_LIMIT = 10;
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_IMAGE_MODE = "cache";
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"]);

let stdinBuffer = "";

function startStdioServer() {
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (chunk) => {
    stdinBuffer += chunk;
    processBuffer();
  });

  process.stdin.on("error", (error) => {
    logError(error);
  });

  process.stdin.on("end", () => {
    if (stdinBuffer.trim().length > 0) {
      handleLine(stdinBuffer.trim());
      stdinBuffer = "";
    }
  });
}

if (require.main === module) {
  startStdioServer();
}

module.exports = {
  __test__: {
    getConfig,
    looksLikePlaceholder,
    candidateCredentialFiles
  }
};

function processBuffer() {
  let newlineIndex;
  while ((newlineIndex = stdinBuffer.indexOf("\n")) !== -1) {
    const rawLine = stdinBuffer.slice(0, newlineIndex);
    stdinBuffer = stdinBuffer.slice(newlineIndex + 1);
    const line = rawLine.replace(/\r$/, "").trim();
    if (line.length === 0) {
      continue;
    }
    handleLine(line);
  }
}

function handleLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    logError(error);
    return;
  }

  handleMessage(message).catch((error) => {
    logError(error);
    if (message && message.id !== undefined) {
      sendError(message.id, -32000, error.message || String(error));
    }
  });
}

async function handleMessage(message) {
  if (!message || typeof message.method !== "string") {
    return;
  }

  if (message.method.startsWith("notifications/")) {
    return;
  }

  if (message.id === undefined) {
    return;
  }

  switch (message.method) {
    case "initialize":
      sendResult(message.id, {
        protocolVersion: negotiateProtocolVersion(message.params),
        capabilities: {
          tools: {},
          prompts: {}
        },
        serverInfo: {
          name: "ado-bug-agent",
          version: SERVER_VERSION
        }
      });
      return;
    case "tools/list":
      sendResult(message.id, { tools: listTools() });
      return;
    case "tools/call":
      sendResult(message.id, await callTool(message.params || {}));
      return;
    case "prompts/list":
      sendResult(message.id, { prompts: listPrompts() });
      return;
    case "prompts/get":
      sendResult(message.id, getPrompt(message.params || {}));
      return;
    default:
      sendError(message.id, -32601, `Unsupported method: ${message.method}`);
  }
}

function negotiateProtocolVersion(params) {
  const requested = params && typeof params.protocolVersion === "string" ? params.protocolVersion : null;
  if (requested && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
    return requested;
  }
  return DEFAULT_PROTOCOL_VERSION;
}

function sendResult(id, result) {
  writeJson({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  writeJson({ jsonrpc: "2.0", id, error: { code, message } });
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function logError(error) {
  process.stderr.write(`[ado-bug-agent] ${error && error.stack ? error.stack : String(error)}\n`);
}

function listTools() {
  return [
    {
      name: "ado_list_projects",
      description: "List Azure DevOps projects visible to the configured PAT.",
      inputSchema: {
        type: "object",
        properties: {}
      }
    },
    {
      name: "ado_search_bugs",
      description: "Search Azure DevOps Bugs by title and/or assignee in a project.",
      inputSchema: {
        type: "object",
        required: ["project"],
        properties: {
          project: { type: "string" },
          title: { type: "string" },
          assignedTo: { type: "string" },
          includeClosed: { type: "boolean", default: false },
          limit: { type: "integer", minimum: 1, maximum: 100, default: 10 }
        }
      }
    },
    {
      name: "ado_get_bug",
      description: "Fetch one Azure DevOps Bug by ID, including fields, relations, optional comments, and downloadable image evidence.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "integer" },
          project: { type: "string" },
          includeComments: { type: "boolean", default: true },
          includeImages: { type: "boolean", default: true },
          imageMode: { type: "string", enum: ["cache", "inline", "metadata"], default: DEFAULT_IMAGE_MODE },
          maxImages: { type: "integer", minimum: 0, maximum: MAX_IMAGE_LIMIT, default: DEFAULT_IMAGE_LIMIT },
          maxImageBytes: { type: "integer", minimum: 1, default: DEFAULT_MAX_IMAGE_BYTES },
          sanitizeRichText: { type: "boolean", default: true }
        }
      }
    },
    {
      name: "ado_get_open_bug_assignees",
      description: "List distinct assignees from open Bugs in a project.",
      inputSchema: {
        type: "object",
        required: ["project"],
        properties: {
          project: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: 200, default: 100 }
        }
      }
    },
    {
      name: "ado_search_identities",
      description: "Search Azure DevOps identities by display name or email.",
      inputSchema: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string" }
        }
      }
    },
    {
      name: "ado_clear_bug_image_cache",
      description: "Delete cached ADO image attachments for one Bug after its analysis and repair plan have been confirmed.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "integer" }
        }
      }
    }
  ];
}

function listPrompts() {
  return [
    {
      name: "ado_bug_setup",
      description: "Set up default Azure DevOps project and assignee for the ADO Bug Agent.",
      arguments: []
    },
    {
      name: "ado_bug_analyze",
      description: "Analyze one Azure DevOps Bug by ID or title.",
      arguments: [
        { name: "bug", description: "Bug ID or title", required: true }
      ]
    },
    {
      name: "ado_bug_scan",
      description: "Scan open Bugs for the configured project and assignee.",
      arguments: []
    },
    {
      name: "ado_bug_batch_plan",
      description: "Build a human-reviewed repair batch plan from Bug IDs or title/theme selectors, generating missing analysis drafts when needed.",
      arguments: [
        { name: "input", description: "Optional Bug IDs, title/theme selectors, and/or batch id", required: false }
      ]
    },
    {
      name: "ado_bug_fix",
      description: "Fix one confirmed Bug by id, issue slug, or title/theme selector.",
      arguments: [
        { name: "issue", description: "Issue directory name or ADO Bug ID", required: true },
        { name: "batch", description: "Batch identifier", required: false }
      ]
    },
    {
      name: "ado_bug_batch_fix",
      description: "Batch-fix one approved wave in a shared wave worktree.",
      arguments: [
        { name: "input", description: "Optional batch id and wave number", required: false }
      ]
    }
  ];
}

function getPrompt(params) {
  const name = params.name;
  const args = params.arguments || {};
  if (name === "ado_bug_setup") {
    return promptResult("Set up ADO Bug Agent defaults using the bundled MCP tools. List projects, ask me to choose one, choose or enter an assignee, then write .ado-bug-agent/config.json.");
  }
  if (name === "ado_bug_analyze") {
    const bug = args.bug || "<bug id or title>";
    return promptResult(`Analyze Azure DevOps Bug ${bug}. Use the bundled ADO MCP tools, including ado_get_bug image evidence when available. Keep ado_get_bug imageMode at the default "cache" unless inline image content is explicitly needed. Follow the ADO Bug Agent issue lifecycle: create or update an observable-facts report first, then draft a code-backed root-cause analysis with file:line evidence, 2-3 repair options, expected touched files, verification, and risk. Stop at the human checkpoint. Do not modify business code or commit.`);
  }
  if (name === "ado_bug_scan") {
    return promptResult("Scan open Azure DevOps Bugs for the configured project and assignee. If multiple Bugs are eligible and the host supports subagents, coordinate one isolated subagent per Bug with 2-3 active at a time and collect only summaries plus artifact paths. For each eligible Bug, use the ADO Bug Agent issue lifecycle: observable-facts report first, then code-backed root-cause analysis with file:line evidence, repair options, expected touched files, verification, and risk. Parallelize analysis only. Do not modify business code or commit.");
  }
  if (name === "ado_bug_batch_plan") {
    const input = args.input || "";
    return promptResult(`Build an ADO Bug repair batch plan. Input: ${input || "<auto>"}. Numeric inputs are ADO Bug IDs; non-numeric inputs are title/theme selectors. If selected Bugs are missing local report or analysis artifacts, fetch them through the bundled ADO MCP tools and run the normal single-Bug report/analyze lifecycle first, stopping generated work at analysis-draft. If no selectors are provided, include all analysis-confirmed issues under bug-analysis/issues. For every candidate, sync confirmation: when analysis frontmatter is confirmed and agent-run status is still analysis-draft, advance agent-run to analysis-confirmed. Only analysis-confirmed Bugs with an accepted repair option and non-empty fix_scope can enter repair waves; put drafts or incomplete Bugs in blocked with the missing step and next action. Group ready issues into planned waves, record each wave's shared branch/worktree, and write batch-plan.json plus conflict-matrix.md, active-file-locks.json with planned reservations, and run-summary.md under bug-analysis/batches/{batch-id}/. For every ready issue, advance agent-run to batch-planned and stamp batchId. Set batch status to draft and clear image cache for confirmed Bugs that landed in ready waves. Do not modify business code, create worktrees, merge, or commit. Stop for human batch approval, then use ado-bug-batch-fix for approved waves.`);
  }
  if (name === "ado_bug_fix") {
    const issue = args.issue || "<issue-or-ado-id>";
    const batch = args.batch || "<batch id if any>";
    return promptResult(`Fix exactly one ADO Bug: ${issue}. The input may be an ADO ID, issue slug, or title/theme selector; if multiple confirmed Bugs match, ask me to choose one or switch to batch-fix. Use batch ${batch} when provided, otherwise infer the latest approved or active batch containing the issue. Before editing, read the confirmed report/analysis, selected repair option, agent-run.json, and batch plan. Sync confirmation: when frontmatter is confirmed and agent-run is still analysis-draft, advance agent-run to analysis-confirmed; if frontmatter is still draft, stop. Verify this is either a single-issue worktree on branch fix/ado-{id}-{slug} or an approved wave worktree on branch fix/ado-{batch-id}-wave-{wave}; if the worktree does not exist, create it with git worktree add from the batch baseBranch (wave mode) or the repository default branch (single-issue mode). Skip the file-lock check when no batch is associated; otherwise reject conflicts with another active wave. Modify only expected touched files unless I approve a scope change. Before the first edit, advance agent-run to fix-in-progress and stamp branch + worktree. Run the declared verification, write the fix report with selectedOption set, and on completion advance agent-run to fix-completed. Do not commit, merge, or push unless I explicitly ask.`);
  }
  if (name === "ado_bug_batch_fix") {
    const input = args.input || "";
    return promptResult(`Batch-fix confirmed ADO Bugs. Input: ${input || "<auto>"}. Numeric inputs are ADO Bug IDs; non-numeric inputs are title/theme selectors. If no batch is provided, use the latest approved or active batch; if no suitable batch exists, create or refresh a draft batch plan and stop for approval. Resolve approval gate: if batch is draft, stop and ask me to approve before writing status: approved + approvedAt. Choose one wave (arg or first planned/active). Sync confirmation per issue (frontmatter confirmed → agent-run analysis-confirmed); refuse to start any wave with unconfirmed analyses. Use one shared wave worktree and branch for the entire wave, preferably ../ado-bug-worktrees/{batch-id}-wave-{wave} and fix/ado-{batch-id}-wave-{wave}; create it with git worktree add from baseBranch when missing. Activate only the selected wave's planned file locks; flip batch status to active and per-issue agent-run to fix-in-progress when editing starts. Do not create one branch per Bug inside the same wave. Fix all issues in the wave in that worktree, write one fix report per issue with selectedOption, advance agent-run to fix-completed as each fix report becomes completed, and on wave completion flip the wave's lock from active to completed. When this is the last wave and every wave is completed, set batch status to closed. Update run-summary.md and stop for human confirmation before another wave. Subagents may help with read-only inspection or review, but the wave owner applies edits. Do not commit, merge, or push unless I explicitly ask. After fixes land, the human runs PR review and merge outside this command; once a Bug's branch is merged, the human can flip its agent-run status to closed.`);
  }
  throw new Error(`Unknown prompt: ${name}`);
}

function promptResult(text) {
  return {
    description: "ADO Bug Agent prompt",
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text
        }
      }
    ]
  };
}

async function callTool(params) {
  const name = params.name;
  const args = params.arguments || {};
  switch (name) {
    case "ado_list_projects":
      return textResult(await listProjects());
    case "ado_search_bugs":
      return textResult(await searchBugs(args));
    case "ado_get_bug":
      return bugResult(await getBug(args));
    case "ado_get_open_bug_assignees":
      return textResult(await getOpenBugAssignees(args));
    case "ado_search_identities":
      return textResult(await searchIdentities(args));
    case "ado_clear_bug_image_cache":
      return textResult(await clearBugImageCache(args));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function textResult(value) {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
      }
    ]
  };
}

function bugResult(value) {
  const content = [
    {
      type: "text",
      text: JSON.stringify(value.bug, null, 2)
    }
  ];

  for (const image of value.images) {
    content.push({
      type: "image",
      mimeType: image.mimeType,
      data: image.data
    });
  }

  return { content };
}

const PLACEHOLDER_PATTERNS = [/^\$\{[^}]+\}$/, /^%[^%]+%$/];

function looksLikePlaceholder(value) {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return true;
  }
  return PLACEHOLDER_PATTERNS.some((re) => re.test(trimmed));
}

function pickCredentialString(value) {
  return typeof value === "string" && !looksLikePlaceholder(value) ? value : "";
}

function readCredentialsFromEnv() {
  return {
    orgUrl: pickCredentialString(process.env.AZURE_DEVOPS_ORG_URL || process.env.AZDO_ORG_URL || process.env.ADO_ORG_URL),
    org: pickCredentialString(process.env.AZURE_DEVOPS_ORG || process.env.AZDO_ORG || process.env.ADO_ORG),
    pat: pickCredentialString(process.env.AZURE_DEVOPS_PAT || process.env.AZDO_PAT || process.env.ADO_PAT)
  };
}

function candidateCredentialFiles() {
  const candidates = [];
  const explicit = pickCredentialString(process.env.ADO_BUG_AGENT_CREDENTIALS_FILE);
  if (explicit) {
    candidates.push(path.resolve(explicit));
  }
  const home = os.homedir();
  if (home) {
    candidates.push(path.join(home, ".ado-bug-agent", "credentials.json"));
  }
  candidates.push(path.resolve(process.cwd(), ".ado-bug-agent", "credentials.json"));
  return candidates;
}

// Re-read on every call. The file is small (~100 bytes) and sync read is
// negligible; caching here previously caused stale PAT after the user rotated
// credentials mid-session.
function readCredentialsFromFile() {
  for (const filePath of candidateCredentialFiles()) {
    let text;
    try {
      text = fsSync.readFileSync(filePath, "utf8");
    } catch (error) {
      if (error && error.code === "ENOENT") {
        continue;
      }
      throw new Error(`ADO credentials file at ${filePath} could not be read; check the file exists and the host process has permission to read it.`);
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (_error) {
      throw new Error(`ADO credentials file at ${filePath} contains invalid JSON; expected an object with "orgUrl" and "pat" string fields.`);
    }

    const creds = {
      orgUrl: pickCredentialString(data && data.orgUrl),
      org: pickCredentialString(data && data.org),
      pat: pickCredentialString(data && data.pat)
    };

    if (creds.pat || creds.orgUrl || creds.org) {
      return { creds, path: filePath };
    }
  }

  return { creds: { orgUrl: "", org: "", pat: "" }, path: null };
}

function getConfig() {
  const fromEnv = readCredentialsFromEnv();
  const { creds: fromFile } = readCredentialsFromFile();

  const orgUrlRaw = fromEnv.orgUrl || fromFile.orgUrl;
  const orgName = fromEnv.org || fromFile.org;
  const pat = fromEnv.pat || fromFile.pat;

  const orgUrl = orgUrlRaw || (orgName ? `https://dev.azure.com/${orgName}` : "");

  if (!orgUrl || !pat) {
    const missing = [];
    if (!orgUrl) missing.push("organization URL");
    if (!pat) missing.push("PAT");
    const candidates = candidateCredentialFiles();
    const recommendedFile = candidates.length > 1 ? candidates[candidates.length - 2] : candidates[candidates.length - 1];
    throw new Error(
      `ADO credentials not found (missing: ${missing.join(", ")}). ` +
      `Looked at: process env (AZURE_DEVOPS_ORG_URL / AZURE_DEVOPS_PAT and AZDO_*/ADO_* aliases) ` +
      `and credentials files: ${candidates.join(", ")}. ` +
      `Fix: write {"orgUrl":"https://dev.azure.com/<org>","pat":"<pat>"} to ${recommendedFile}, ` +
      `or set AZURE_DEVOPS_ORG_URL and AZURE_DEVOPS_PAT in the host process environment ` +
      `(restart Claude Code / Cursor / Codex after changing host env so the MCP child process inherits the new values).`
    );
  }

  return {
    orgUrl: orgUrl.replace(/\/+$/, ""),
    pat
  };
}

async function adoFetch(path, options = {}) {
  const { orgUrl, pat } = getConfig();
  const url = path.startsWith("http") ? path : `${orgUrl}${path}`;
  const headers = {
    Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
    Accept: "application/json",
    ...(options.headers || {})
  };
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Azure DevOps API ${response.status}: ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

async function adoFetchBinary(path, maxBytes) {
  const { orgUrl, pat } = getConfig();
  const url = path.startsWith("http") ? path : `${orgUrl}${path}`;
  const headers = {
    Authorization: `Basic ${Buffer.from(`:${pat}`).toString("base64")}`,
    Accept: "*/*"
  };

  const response = await fetch(url, { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Azure DevOps attachment API ${response.status}: ${text.slice(0, 300)}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    throw new Error(`Attachment is too large: ${contentLength} bytes exceeds ${maxBytes} bytes.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new Error(`Attachment is too large: ${buffer.length} bytes exceeds ${maxBytes} bytes.`);
  }

  return {
    buffer,
    sizeBytes: buffer.length,
    mimeType: normalizeMimeType(response.headers.get("content-type"))
  };
}

async function listProjects() {
  const data = await adoFetch(`/_apis/projects?api-version=${API_VERSION}`);
  return {
    count: data.count || 0,
    projects: (data.value || []).map((project) => ({
      id: project.id,
      name: project.name,
      state: project.state,
      visibility: project.visibility
    }))
  };
}

async function searchBugs(args) {
  const project = requireString(args.project, "project");
  const limit = clampNumber(args.limit || 10, 1, 100);
  const conditions = [
    "[System.TeamProject] = @project",
    "[System.WorkItemType] = 'Bug'"
  ];

  if (!args.includeClosed) {
    conditions.push("[System.State] NOT IN ('Closed', 'Removed', 'Done')");
  }
  if (args.title) {
    conditions.push(`[System.Title] CONTAINS '${escapeWiql(args.title)}'`);
  }
  if (args.assignedTo) {
    conditions.push(`[System.AssignedTo] CONTAINS '${escapeWiql(args.assignedTo)}'`);
  }

  const wiql = `
SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo], [System.ChangedDate]
FROM WorkItems
WHERE ${conditions.join("\n  AND ")}
ORDER BY [System.ChangedDate] DESC`;

  const data = await runWiql(project, wiql);
  const ids = (data.workItems || []).slice(0, limit).map((item) => item.id);
  return {
    query: wiql.trim(),
    count: ids.length,
    bugs: ids.length ? await getWorkItems(ids) : []
  };
}

async function getBug(args) {
  const id = Number(args.id);
  if (!Number.isInteger(id)) {
    throw new Error("id must be an integer.");
  }

  const item = await adoFetch(`/_apis/wit/workitems/${id}?$expand=Relations&api-version=${API_VERSION}`);
  const fields = item.fields || {};
  if (fields["System.WorkItemType"] !== "Bug") {
    throw new Error(`Work item ${id} is ${fields["System.WorkItemType"] || "unknown"}, not Bug.`);
  }

  const project = args.project || fields["System.TeamProject"];
  let comments = [];
  if (args.includeComments !== false && project) {
    try {
      const commentData = await adoFetch(`/${encodeURIComponent(project)}/_apis/wit/workItems/${id}/comments?api-version=${COMMENT_API_VERSION}`);
      comments = (commentData.comments || []).map((comment) => ({
        id: comment.id,
        text: comment.text,
        createdBy: normalizeIdentity(comment.createdBy),
        createdDate: comment.createdDate,
        modifiedDate: comment.modifiedDate
      }));
    } catch (error) {
      comments = [{ error: error.message || String(error) }];
    }
  }

  const sanitizeRichText = args.sanitizeRichText !== false;
  const imageMode = normalizeImageMode(args.imageMode);
  const maxImages = clampNumber(args.maxImages === undefined ? DEFAULT_IMAGE_LIMIT : args.maxImages, 0, MAX_IMAGE_LIMIT);
  const maxImageBytes = clampNumber(args.maxImageBytes || DEFAULT_MAX_IMAGE_BYTES, 1, Number.MAX_SAFE_INTEGER);
  const imageRefs = collectImageReferences(fields, item.relations || [], comments);
  const selectedImageRefs = args.includeImages === false ? [] : imageRefs.slice(0, maxImages);
  const imageDownloads = await downloadImageReferences(selectedImageRefs, maxImageBytes, imageMode, item.id);
  const imageEvidence = buildImageEvidence(imageRefs, imageDownloads, selectedImageRefs.length, maxImages);

  const bug = {
    id: item.id,
    rev: item.rev,
    url: item.url,
    fields: sanitizeRichText ? sanitizeObject(fields) : fields,
    relations: sanitizeRelations(item.relations || [], sanitizeRichText),
    comments: comments.map((comment) => sanitizeRichText ? sanitizeObject(comment) : comment),
    imageEvidence
  };

  return {
    bug,
    images: imageDownloads.filter((image) => image.data)
  };
}

async function getOpenBugAssignees(args) {
  const project = requireString(args.project, "project");
  const limit = clampNumber(args.limit || 100, 1, 200);
  const wiql = `
SELECT [System.Id], [System.AssignedTo]
FROM WorkItems
WHERE [System.TeamProject] = @project
  AND [System.WorkItemType] = 'Bug'
  AND [System.State] NOT IN ('Closed', 'Removed', 'Done')
ORDER BY [System.ChangedDate] DESC`;
  const data = await runWiql(project, wiql);
  const ids = (data.workItems || []).slice(0, limit).map((item) => item.id);
  const items = ids.length ? await getWorkItems(ids) : [];
  const seen = new Map();
  for (const item of items) {
    const assignee = normalizeIdentity((item.fields || {})["System.AssignedTo"]);
    if (!assignee.displayName && !assignee.uniqueName) {
      continue;
    }
    const key = assignee.uniqueName || assignee.displayName;
    seen.set(key, assignee);
  }
  return {
    count: seen.size,
    assignees: Array.from(seen.values())
  };
}

async function clearBugImageCache(args) {
  const id = Number(args.id);
  if (!Number.isInteger(id)) {
    throw new Error("id must be an integer.");
  }

  const cacheRoot = getAttachmentCacheRoot();
  const targetDir = path.resolve(cacheRoot, String(id));
  assertPathInside(cacheRoot, targetDir);

  let existed = true;
  try {
    await fs.stat(targetDir);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      existed = false;
    } else {
      throw error;
    }
  }

  if (existed) {
    await fs.rm(targetDir, { recursive: true, force: true });
  }

  return {
    id,
    cacheDir: targetDir,
    deleted: existed
  };
}

async function searchIdentities(args) {
  const query = requireString(args.query, "query");
  const data = await adoFetch(`/_apis/Identities?searchFilter=General&filterValue=${encodeURIComponent(query)}&queryMembership=None&api-version=7.1-preview.1`);
  return {
    count: data.count || 0,
    identities: (data.value || []).map((identity) => ({
      id: identity.id,
      displayName: identity.providerDisplayName || identity.displayName,
      uniqueName: identity.properties && identity.properties.Account ? identity.properties.Account.$value : identity.uniqueName,
      descriptor: identity.descriptor
    }))
  };
}

async function runWiql(project, query) {
  return adoFetch(`/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=${API_VERSION}`, {
    method: "POST",
    body: JSON.stringify({ query })
  });
}

async function getWorkItems(ids) {
  const data = await adoFetch(`/_apis/wit/workitems?ids=${ids.join(",")}&$expand=Relations&api-version=${API_VERSION}`);
  return (data.value || []).map((item) => ({
    id: item.id,
    rev: item.rev,
    fields: item.fields || {},
    relations: item.relations || []
  }));
}

function normalizeIdentity(value) {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    return { displayName: value };
  }
  return {
    displayName: value.displayName,
    uniqueName: value.uniqueName,
    id: value.id,
    descriptor: value.descriptor
  };
}

function collectImageReferences(fields, relations, comments) {
  const refs = [];

  for (const [fieldName, value] of Object.entries(fields || {})) {
    if (typeof value === "string") {
      collectImageReferencesFromText(value, `field:${fieldName}`, refs);
    }
  }

  for (const comment of comments || []) {
    if (comment && typeof comment.text === "string") {
      collectImageReferencesFromText(comment.text, `comment:${comment.id || "unknown"}`, refs);
    }
  }

  for (const relation of relations || []) {
    if (!relation || relation.rel !== "AttachedFile" || typeof relation.url !== "string") {
      continue;
    }
    const name = relation.attributes && relation.attributes.name ? String(relation.attributes.name) : filenameFromUrl(relation.url);
    refs.push({
      source: "relation:AttachedFile",
      url: relation.url,
      name,
      sizeBytes: relation.attributes && relation.attributes.resourceSize,
      candidateType: isImageFilename(name) ? "image-filename" : "attachment"
    });
  }

  return dedupeImageReferences(refs);
}

function collectImageReferencesFromText(text, source, refs) {
  const imgTagPattern = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgTagPattern.exec(text)) !== null) {
    const url = decodeHtmlEntities(match[1]);
    refs.push({
      source,
      url,
      name: filenameFromUrl(url)
    });
  }

  const markdownImagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  while ((match = markdownImagePattern.exec(text)) !== null) {
    const url = decodeHtmlEntities(match[1]);
    refs.push({
      source,
      url,
      name: filenameFromUrl(url)
    });
  }
}

function dedupeImageReferences(refs) {
  const seen = new Set();
  const result = [];
  for (const ref of refs) {
    if (!ref.url || typeof ref.url !== "string") {
      continue;
    }
    const key = ref.url;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(ref);
  }
  return result;
}

async function downloadImageReferences(refs, maxImageBytes, imageMode, bugId) {
  const images = [];
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    try {
      if (imageMode === "metadata") {
        images.push({
          index,
          source: ref.source,
          name: ref.name,
          sizeBytes: ref.sizeBytes,
          status: "metadata-only"
        });
        continue;
      }

      if (ref.url.startsWith("data:image/")) {
        const inlineImage = readDataImage(ref, index);
        if (inlineImage.sizeBytes > maxImageBytes) {
          throw new Error(`Inline image is too large: ${inlineImage.sizeBytes} bytes exceeds ${maxImageBytes} bytes.`);
        }
        images.push(await materializeImage(inlineImage, imageMode, bugId));
        continue;
      }

      if (!isAllowedAdoAttachmentUrl(ref.url)) {
        throw new Error("Skipping external or non-ADO attachment URL.");
      }

      const downloaded = await adoFetchBinary(toAttachmentDownloadUrl(ref.url), maxImageBytes);
      const inferredMimeType = downloaded.mimeType || mimeTypeFromFilename(ref.name);
      if (!isSupportedImageMimeType(inferredMimeType)) {
        throw new Error(`Attachment content type is not a supported image: ${inferredMimeType || "unknown"}.`);
      }
      images.push(await materializeImage({
        index,
        source: ref.source,
        name: ref.name,
        mimeType: inferredMimeType,
        sizeBytes: downloaded.sizeBytes,
        buffer: downloaded.buffer,
        status: "downloaded"
      }, imageMode, bugId));
    } catch (error) {
      images.push({
        index,
        source: ref.source,
        name: ref.name,
        status: "error",
        error: error.message || String(error)
      });
    }
  }
  return images;
}

function readDataImage(ref, index) {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(ref.url);
  if (!match) {
    throw new Error("Unsupported inline image data URI.");
  }
  const mimeType = normalizeMimeType(match[1]);
  if (!isSupportedImageMimeType(mimeType)) {
    throw new Error(`Inline image content type is not supported: ${mimeType || "unknown"}.`);
  }
  return {
    index,
    source: ref.source,
    name: ref.name,
    mimeType,
    sizeBytes: Buffer.from(match[2], "base64").length,
    buffer: Buffer.from(match[2], "base64"),
    status: "downloaded"
  };
}

async function materializeImage(image, imageMode, bugId) {
  if (imageMode === "inline") {
    return {
      ...image,
      data: image.buffer.toString("base64"),
      buffer: undefined
    };
  }

  const localPath = await writeCachedImage(image, bugId);
  return {
    ...image,
    localPath,
    buffer: undefined
  };
}

async function writeCachedImage(image, bugId) {
  const cacheRoot = getAttachmentCacheRoot();
  const bugDir = path.join(cacheRoot, String(bugId));
  assertPathInside(cacheRoot, path.resolve(bugDir));
  await fs.mkdir(bugDir, { recursive: true });

  const extension = extensionFromMimeType(image.mimeType) || path.extname(image.name || "") || ".img";
  const baseName = sanitizeFilename(path.basename(image.name || "ado-image", path.extname(image.name || ""))) || "ado-image";
  const hash = crypto.createHash("sha256").update(image.buffer).digest("hex").slice(0, 12);
  const filePath = path.join(bugDir, `${String(image.index).padStart(2, "0")}-${baseName}-${hash}${extension}`);
  await fs.writeFile(filePath, image.buffer);
  return filePath;
}

function getAttachmentCacheRoot() {
  return path.resolve(process.env.ADO_BUG_AGENT_CACHE_DIR || path.join(process.cwd(), ".ado-bug-agent", "cache", "attachments"));
}

function assertPathInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new Error(`Refusing to access path outside attachment cache: ${target}`);
}

function buildImageEvidence(allRefs, imageDownloads, selectedCount, maxImages) {
  const byIndex = new Map(imageDownloads.map((image) => [image.index, image]));
  return allRefs.map((ref, index) => {
    const download = byIndex.get(index);
    if (!download) {
      return {
        index,
        source: ref.source,
        name: ref.name,
        candidateType: ref.candidateType,
        status: index >= maxImages ? "skipped-limit" : "not-requested",
        selectedCount
      };
    }
    return {
      index,
      source: ref.source,
      name: ref.name,
      candidateType: ref.candidateType,
      status: download.status,
      mimeType: download.mimeType,
      sizeBytes: download.sizeBytes,
      returnedAsImageContent: Boolean(download.data),
      localPath: download.localPath,
      error: download.error
    };
  });
}

function sanitizeObject(value) {
  if (typeof value === "string") {
    return sanitizeRichTextValue(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObject(item));
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = sanitizeObject(child);
    }
    return result;
  }
  return value;
}

function sanitizeRelations(relations, shouldSanitize) {
  if (!shouldSanitize) {
    return relations;
  }
  return relations.map((relation) => {
    if (!relation || relation.rel !== "AttachedFile") {
      return sanitizeObject(relation);
    }
    const attributes = relation.attributes || {};
    return {
      rel: relation.rel,
      attributes: sanitizeObject({
        name: attributes.name,
        comment: attributes.comment,
        resourceSize: attributes.resourceSize,
        revisedDate: attributes.revisedDate,
        authorizedDate: attributes.authorizedDate
      }),
      urlOmitted: true
    };
  });
}

function sanitizeRichTextValue(value) {
  return value
    .replace(/<img\b[^>]*>/gi, "[ADO image omitted from text; returned separately when downloadable]")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "[ADO image omitted from text; returned separately when downloadable]")
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, "[ADO inline image omitted from text]")
    .replace(/https?:\/\/[^\s"'<>)]+_apis\/wit\/attachments\/[^\s"'<>)]+/gi, "[ADO attachment URL omitted from text]");
}

function toAttachmentDownloadUrl(rawUrl) {
  const decodedUrl = decodeHtmlEntities(rawUrl);
  if (decodedUrl.startsWith("data:image/")) {
    return decodedUrl;
  }

  const url = new URL(decodedUrl, getConfig().orgUrl);
  if (!url.searchParams.has("api-version")) {
    url.searchParams.set("api-version", API_VERSION);
  }
  if (!url.searchParams.has("download")) {
    url.searchParams.set("download", "true");
  }
  return url.toString();
}

function isAllowedAdoAttachmentUrl(rawUrl) {
  try {
    const { orgUrl } = getConfig();
    const org = new URL(orgUrl);
    const url = new URL(decodeHtmlEntities(rawUrl), orgUrl);
    if (url.origin !== org.origin) {
      return false;
    }
    const orgPath = org.pathname.replace(/\/+$/, "");
    const pathAllowed = orgPath === "" || url.pathname === orgPath || url.pathname.startsWith(`${orgPath}/`);
    if (!pathAllowed) {
      return false;
    }
    return /\/_apis\/wit\/attachments\//i.test(url.pathname);
  } catch (_error) {
    return false;
  }
}

function filenameFromUrl(rawUrl) {
  try {
    const url = new URL(decodeHtmlEntities(rawUrl), getConfig().orgUrl);
    return url.searchParams.get("fileName") || url.pathname.split("/").filter(Boolean).pop() || "ado-image";
  } catch (_error) {
    return "ado-image";
  }
}

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isImageFilename(name) {
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(name || ""));
}

function normalizeMimeType(value) {
  if (!value) {
    return "";
  }
  return String(value).split(";")[0].trim().toLowerCase();
}

function mimeTypeFromFilename(name) {
  const lowerName = String(name || "").toLowerCase();
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".gif")) return "image/gif";
  if (lowerName.endsWith(".webp")) return "image/webp";
  if (lowerName.endsWith(".bmp")) return "image/bmp";
  return "";
}

function isSupportedImageMimeType(mimeType) {
  return IMAGE_MIME_TYPES.has(normalizeMimeType(mimeType));
}

function normalizeImageMode(value) {
  if (value === "inline" || value === "metadata") {
    return value;
  }
  return DEFAULT_IMAGE_MODE;
}

function extensionFromMimeType(mimeType) {
  const normalized = normalizeMimeType(mimeType);
  if (normalized === "image/png") return ".png";
  if (normalized === "image/jpeg") return ".jpg";
  if (normalized === "image/gif") return ".gif";
  if (normalized === "image/webp") return ".webp";
  if (normalized === "image/bmp") return ".bmp";
  return "";
}

function sanitizeFilename(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function requireString(value, name) {
  if (!value || typeof value !== "string") {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function escapeWiql(value) {
  return String(value).replace(/'/g, "''");
}
