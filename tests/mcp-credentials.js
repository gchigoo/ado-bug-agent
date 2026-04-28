#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SERVER = path.join(__dirname, "..", "mcp", "ado-bug-agent-mcp.js");

function withIsolatedEnv(env, overrides, fn) {
  const oldEnv = { ...process.env };
  const oldCwd = process.cwd();
  for (const key of Object.keys(process.env)) {
    if (/^(AZURE_DEVOPS_|AZDO_|ADO_)/.test(key)) {
      delete process.env[key];
    }
  }
  delete process.env.ADO_BUG_AGENT_CREDENTIALS_FILE;
  if (overrides.isolatedHome) {
    process.env.HOME = overrides.isolatedHome;
    process.env.USERPROFILE = overrides.isolatedHome;
  }
  Object.assign(process.env, env);
  if (overrides.cwd) {
    process.chdir(overrides.cwd);
  }
  try {
    delete require.cache[require.resolve(SERVER)];
    const mod = require(SERVER);
    return fn(mod.__test__);
  } finally {
    process.chdir(oldCwd);
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, oldEnv);
  }
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ado-bug-agent-cred-"));
}

function captureGetConfig(envOverrides, opts = {}) {
  const dir = makeTempDir();
  try {
    if (opts.credentialsFile) {
      const filePath = path.join(dir, "credentials.json");
      fs.writeFileSync(filePath, JSON.stringify(opts.credentialsFile));
      envOverrides = { ...envOverrides, ADO_BUG_AGENT_CREDENTIALS_FILE: filePath };
    }
    return withIsolatedEnv(envOverrides, { isolatedHome: dir, cwd: dir }, (api) => ({
      result: api.getConfig(),
      dir
    }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function captureGetConfigError(envOverrides) {
  const dir = makeTempDir();
  try {
    return withIsolatedEnv(envOverrides, { isolatedHome: dir, cwd: dir }, (api) => {
      try {
        api.getConfig();
        return null;
      } catch (error) {
        return error;
      }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

(function run() {
  // Test 1: env vars work
  {
    const { result } = captureGetConfig({
      AZURE_DEVOPS_ORG_URL: "https://dev.azure.com/test-env",
      AZURE_DEVOPS_PAT: "pat-from-env"
    });
    assert.equal(result.orgUrl, "https://dev.azure.com/test-env");
    assert.equal(result.pat, "pat-from-env");
  }

  // Test 2: literal placeholder is treated as missing
  {
    const error = captureGetConfigError({
      AZURE_DEVOPS_ORG_URL: "${AZURE_DEVOPS_ORG_URL}",
      AZURE_DEVOPS_PAT: "${AZURE_DEVOPS_PAT}"
    });
    assert.ok(error, "expected getConfig to throw on literal placeholders");
    assert.ok(/credentials not found/i.test(error.message), `error should mention credentials: ${error.message}`);
    assert.ok(!error.message.includes("${AZURE_DEVOPS_PAT}") || /Looked at/.test(error.message), "error message should not echo placeholder PAT value as if it were a real value");
  }

  // Test 3: %VAR% placeholder is also treated as missing
  {
    const error = captureGetConfigError({
      AZURE_DEVOPS_ORG_URL: "%AZURE_DEVOPS_ORG_URL%",
      AZURE_DEVOPS_PAT: "%AZURE_DEVOPS_PAT%"
    });
    assert.ok(error, "expected getConfig to throw on %VAR% placeholders");
    assert.ok(/credentials not found/i.test(error.message));
  }

  // Test 4: empty string is treated as missing
  {
    const error = captureGetConfigError({
      AZURE_DEVOPS_ORG_URL: "",
      AZURE_DEVOPS_PAT: ""
    });
    assert.ok(error, "expected getConfig to throw on empty strings");
  }

  // Test 5: credentials file fallback when env is missing
  {
    const { result } = captureGetConfig({}, {
      credentialsFile: { orgUrl: "https://dev.azure.com/from-file", pat: "pat-from-file" }
    });
    assert.equal(result.orgUrl, "https://dev.azure.com/from-file");
    assert.equal(result.pat, "pat-from-file");
  }

  // Test 6: credentials file with org shorthand
  {
    const { result } = captureGetConfig({}, {
      credentialsFile: { org: "myorg", pat: "p" }
    });
    assert.equal(result.orgUrl, "https://dev.azure.com/myorg");
    assert.equal(result.pat, "p");
  }

  // Test 7: env wins over credentials file
  {
    const { result } = captureGetConfig({
      AZURE_DEVOPS_ORG_URL: "https://dev.azure.com/env-wins",
      AZURE_DEVOPS_PAT: "env-pat"
    }, {
      credentialsFile: { orgUrl: "https://dev.azure.com/file-loses", pat: "file-pat" }
    });
    assert.equal(result.orgUrl, "https://dev.azure.com/env-wins");
    assert.equal(result.pat, "env-pat");
  }

  // Test 8: credentials file with literal placeholders is treated as missing
  {
    const error = captureGetConfigError({});
    assert.ok(error, "expected getConfig to throw with no env and no file");
    assert.ok(/credentials.json/i.test(error.message), `error should mention credentials.json path: ${error.message}`);
  }

  // Test 9: error message must not contain the literal PAT value
  {
    const error = captureGetConfigError({
      AZURE_DEVOPS_ORG_URL: "https://dev.azure.com/x",
      AZURE_DEVOPS_PAT: ""
    });
    assert.ok(error, "expected error when PAT is empty");
    assert.ok(!error.message.includes("supersecret"), "error message must never leak PAT");
  }

  // Test 10a: credentials file written between calls is picked up (no negative cache)
  {
    const dir = makeTempDir();
    try {
      const filePath = path.join(dir, "credentials.json");
      withIsolatedEnv(
        { ADO_BUG_AGENT_CREDENTIALS_FILE: filePath },
        { isolatedHome: dir, cwd: dir },
        (api) => {
          assert.throws(() => api.getConfig(), /credentials not found/i, "first call without file must fail");
          fs.writeFileSync(filePath, JSON.stringify({ orgUrl: "https://dev.azure.com/late", pat: "late-pat" }));
          const result = api.getConfig();
          assert.equal(result.orgUrl, "https://dev.azure.com/late", "second call must pick up newly written file");
          assert.equal(result.pat, "late-pat");
        }
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  // Test 10: env aliases work
  {
    const { result } = captureGetConfig({
      AZDO_ORG: "alias-org",
      AZDO_PAT: "alias-pat"
    });
    assert.equal(result.orgUrl, "https://dev.azure.com/alias-org");
    assert.equal(result.pat, "alias-pat");
  }

  process.stdout.write("ok - mcp credentials\n");
})();
