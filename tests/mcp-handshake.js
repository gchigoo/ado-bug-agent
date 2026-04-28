#!/usr/bin/env node
"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "mcp", "ado-bug-agent-mcp.js");
const PROTOCOL_VERSION = "2025-11-25";
const TIMEOUT_MS = 5000;

function runHandshake() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        AZURE_DEVOPS_ORG_URL: "https://dev.azure.com/test-org",
        AZURE_DEVOPS_PAT: "test-pat-not-used"
      }
    });

    const responses = new Map();
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Handshake timed out after ${TIMEOUT_MS} ms.\nstderr:\n${stderrBuffer}`));
    }, TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      let newlineIndex;
      while ((newlineIndex = stdoutBuffer.indexOf("\n")) !== -1) {
        const line = stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "").trim();
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined) {
            responses.set(msg.id, msg);
          }
        } catch (error) {
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new Error(`Server emitted non-JSON line: ${line}`));
          return;
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderrBuffer += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      if (signal === "SIGKILL") return;
      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}.\nstderr:\n${stderrBuffer}`));
      }
    });

    function send(payload) {
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    }

    function waitFor(id) {
      return new Promise((res, rej) => {
        const start = Date.now();
        const tick = () => {
          if (responses.has(id)) {
            res(responses.get(id));
            return;
          }
          if (Date.now() - start > TIMEOUT_MS - 200) {
            rej(new Error(`No response for id ${id}.\nstderr:\n${stderrBuffer}`));
            return;
          }
          setTimeout(tick, 25);
        };
        tick();
      });
    }

    (async () => {
      try {
        send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "handshake-test", version: "0.0.0" }
          }
        });
        const initRes = await waitFor(1);
        assert.equal(initRes.jsonrpc, "2.0", "initialize: jsonrpc field");
        assert.ok(initRes.result, "initialize: result missing");
        assert.equal(
          initRes.result.protocolVersion,
          PROTOCOL_VERSION,
          `initialize: expected echoed protocolVersion ${PROTOCOL_VERSION}, got ${initRes.result.protocolVersion}`
        );
        assert.ok(initRes.result.serverInfo, "initialize: serverInfo missing");
        assert.equal(initRes.result.serverInfo.name, "ado-bug-agent");

        send({ jsonrpc: "2.0", method: "notifications/initialized" });

        send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
        const toolsRes = await waitFor(2);
        assert.ok(toolsRes.result, "tools/list: result missing");
        assert.ok(Array.isArray(toolsRes.result.tools), "tools/list: tools not array");
        const toolNames = toolsRes.result.tools.map((t) => t.name).sort();
        assert.deepEqual(
          toolNames,
          [
            "ado_get_bug",
            "ado_get_open_bug_assignees",
            "ado_list_projects",
            "ado_search_bugs",
            "ado_search_identities"
          ],
          `tools/list: unexpected tool set ${JSON.stringify(toolNames)}`
        );

        send({ jsonrpc: "2.0", id: 3, method: "prompts/list" });
        const promptsRes = await waitFor(3);
        assert.ok(promptsRes.result, "prompts/list: result missing");
        assert.ok(Array.isArray(promptsRes.result.prompts), "prompts/list: prompts not array");
        assert.ok(
          promptsRes.result.prompts.length >= 3,
          `prompts/list: expected at least 3 prompts, got ${promptsRes.result.prompts.length}`
        );

        send({ jsonrpc: "2.0", id: 4, method: "this/does/not/exist" });
        const errRes = await waitFor(4);
        assert.ok(errRes.error, "unknown method: should produce JSON-RPC error");
        assert.equal(errRes.error.code, -32601, "unknown method: expected -32601 method-not-found");

        clearTimeout(timer);
        child.stdin.end();
        child.kill();
        resolve();
      } catch (error) {
        clearTimeout(timer);
        child.kill("SIGKILL");
        reject(error);
      }
    })();
  });
}

runHandshake().then(
  () => {
    process.stdout.write("ok - mcp handshake\n");
    process.exit(0);
  },
  (error) => {
    process.stderr.write(`not ok - mcp handshake\n${error.stack || error}\n`);
    process.exit(1);
  }
);
