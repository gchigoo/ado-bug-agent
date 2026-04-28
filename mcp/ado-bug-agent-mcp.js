#!/usr/bin/env node

const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const DEFAULT_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];
const API_VERSION = "7.1";
const COMMENT_API_VERSION = "7.1-preview.3";

let stdinBuffer = "";

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
          version: "0.1.0"
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
      description: "Fetch one Azure DevOps Bug by ID, including fields, relations, and optional comments.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "integer" },
          project: { type: "string" },
          includeComments: { type: "boolean", default: true }
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
    return promptResult(`Analyze Azure DevOps Bug ${bug}. Use the bundled ADO MCP tools, create or update the bug report, then draft the root-cause analysis. Do not modify business code or commit.`);
  }
  if (name === "ado_bug_scan") {
    return promptResult("Scan open Azure DevOps Bugs for the configured project and assignee. For each eligible Bug, create or update the bug report and root-cause analysis draft. Do not modify business code or commit.");
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
      return textResult(await getBug(args));
    case "ado_get_open_bug_assignees":
      return textResult(await getOpenBugAssignees(args));
    case "ado_search_identities":
      return textResult(await searchIdentities(args));
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

function getConfig() {
  const orgUrlRaw = process.env.AZURE_DEVOPS_ORG_URL || process.env.AZDO_ORG_URL || process.env.ADO_ORG_URL;
  const orgName = process.env.AZURE_DEVOPS_ORG || process.env.AZDO_ORG || process.env.ADO_ORG;
  const pat = process.env.AZURE_DEVOPS_PAT || process.env.AZDO_PAT || process.env.ADO_PAT;

  const orgUrl = orgUrlRaw || (orgName ? `https://dev.azure.com/${orgName}` : "");
  if (!orgUrl) {
    throw new Error("Missing AZURE_DEVOPS_ORG_URL or AZURE_DEVOPS_ORG.");
  }
  if (!pat) {
    throw new Error("Missing AZURE_DEVOPS_PAT.");
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

  return {
    id: item.id,
    rev: item.rev,
    url: item.url,
    fields,
    relations: item.relations || [],
    comments
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
