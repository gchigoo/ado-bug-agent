#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const SERVER = path.join(__dirname, "..", "mcp", "ado-bug-agent-mcp.js");
const TIMEOUT_MS = 5000;
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64"
);

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ado-bug-agent-test-"));
  const cacheRoot = path.join(tempRoot, "cache");
  let externalRequests = 0;
  let externalAuthHeader = "";

  const externalServer = await listen((req, res) => {
    externalRequests += 1;
    externalAuthHeader = req.headers.authorization || "";
    res.writeHead(200, { "content-type": "image/png" });
    res.end(PNG_1X1);
  });

  const externalBaseUrl = `http://127.0.0.1:${externalServer.address().port}`;
  const adoServer = await listen((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/org/_apis/wit/workitems/41702") {
      writeJson(res, {
        id: 41702,
        rev: 3,
        url: "/org/_apis/wit/workitems/41702",
        fields: {
          "System.WorkItemType": "Bug",
          "System.TeamProject": "Project",
          "System.Title": "Image cache test",
          "System.Description": [
            `<p>Internal screenshot <img src="/org/_apis/wit/attachments/internal?fileName=screen.png" /></p>`,
            `<p>External screenshot <img src="${externalBaseUrl}/tracking.png" /></p>`
          ].join("")
        },
        relations: [
          {
            rel: "AttachedFile",
            url: "/org/_apis/wit/attachments/no-extension",
            attributes: {
              name: "clipboard",
              resourceSize: PNG_1X1.length
            }
          }
        ]
      });
      return;
    }
    if (url.pathname === "/org/Project/_apis/wit/workItems/41702/comments") {
      writeJson(res, { comments: [] });
      return;
    }
    if (url.pathname === "/org/_apis/wit/attachments/internal" || url.pathname === "/org/_apis/wit/attachments/no-extension") {
      assert.match(req.headers.authorization || "", /^Basic /, "ADO attachment requests should use PAT auth");
      res.writeHead(200, {
        "content-type": "image/png",
        "content-length": String(PNG_1X1.length)
      });
      res.end(PNG_1X1);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end(`not found: ${url.pathname}`);
  });

  try {
    const orgUrl = `http://127.0.0.1:${adoServer.address().port}/org`;
    const client = spawnMcp({
      AZURE_DEVOPS_ORG_URL: orgUrl,
      AZURE_DEVOPS_PAT: "test-pat",
      ADO_BUG_AGENT_CACHE_DIR: cacheRoot
    });
    try {
      await client.request("initialize", {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "image-cache-test", version: "0.0.0" }
      });
      client.notify("notifications/initialized");

      const bugResult = await client.request("tools/call", {
        name: "ado_get_bug",
        arguments: { id: 41702, maxImages: 10 }
      });

      assert.equal(bugResult.content.length, 1, "cache mode should not return inline image content");
      const bug = JSON.parse(bugResult.content[0].text);
      const text = bugResult.content[0].text;
      assert.equal(text.includes(`${externalBaseUrl}/tracking.png`), false, "sanitized text should omit raw external image URLs");
      assert.equal(externalRequests, 0, "external image URLs must not be fetched");
      assert.equal(externalAuthHeader, "", "external image URLs must not receive Authorization");

      const downloaded = bug.imageEvidence.filter((image) => image.status === "downloaded");
      assert.equal(downloaded.length, 2, "internal rich-text and no-extension AttachedFile images should be cached");
      for (const image of downloaded) {
        assert.ok(image.localPath, "downloaded image should include localPath");
        await fs.access(image.localPath);
      }

      const external = bug.imageEvidence.find((image) => image.source === "field:System.Description" && image.status === "error");
      assert.ok(external, "external image should be represented as a non-downloaded evidence item");
      assert.match(external.error, /external|non-ADO/i);

      const clearResult = await client.request("tools/call", {
        name: "ado_clear_bug_image_cache",
        arguments: { id: 41702 }
      });
      const clear = JSON.parse(clearResult.content[0].text);
      assert.equal(clear.deleted, true, "clear tool should delete existing cache");
      await assert.rejects(fs.access(path.join(cacheRoot, "41702")), /ENOENT/);
    } finally {
      client.close();
    }
  } finally {
    await closeServer(adoServer);
    await closeServer(externalServer);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function listen(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function writeJson(res, value) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
}

function spawnMcp(env) {
  const child = spawn(process.execPath, [SERVER], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      ...env
    }
  });
  const responses = new Map();
  let nextId = 1;
  let stdoutBuffer = "";
  let stderrBuffer = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    let newlineIndex;
    while ((newlineIndex = stdoutBuffer.indexOf("\n")) !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "").trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined) {
        responses.set(message.id, message);
      }
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrBuffer += chunk;
  });

  return {
    request(method, params) {
      const id = nextId;
      nextId += 1;
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return waitForResponse(id, responses, () => stderrBuffer);
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
    close() {
      child.kill();
    }
  };
}

function waitForResponse(id, responses, getStderr) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (responses.has(id)) {
        const message = responses.get(id);
        if (message.error) {
          reject(new Error(`${message.error.code}: ${message.error.message}`));
          return;
        }
        resolve(message.result);
        return;
      }
      if (Date.now() - start > TIMEOUT_MS) {
        reject(new Error(`No response for id ${id}.\nstderr:\n${getStderr()}`));
        return;
      }
      setTimeout(tick, 25);
    };
    tick();
  });
}

main().then(
  () => {
    process.stdout.write("ok - mcp image cache\n");
  },
  (error) => {
    process.stderr.write(`not ok - mcp image cache\n${error.stack || error}\n`);
    process.exit(1);
  }
);
