#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const USAGE = `Usage: node tools/wiki/check.js [--root PATH] [--json] [--strict] [--help]

Read-only wiki validation. Requires Node.js >=22 and npm ci.
  --root PATH  Use PATH (relative to cwd), instead of discovering the vault.
  --json       Print structured JSON only.
  --strict     Exit 1 for warnings as well as validation errors.
  --help       Show this help.

Discovery walks cwd ancestors for a package.json with "researchWiki": true.
Exit: 0 valid, 1 validation errors (or strict warnings), 2 usage/operational failure.`;

function parseArguments(args) {
  const options = { json: false, strict: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--help") options.help = true;
    else if (arg === "--root") {
      if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error("--root requires a path value.");
      if (options.root !== undefined) throw new Error("--root may only be supplied once.");
      options.root = resolve(args[++i]);
    } else throw new Error(`Unknown argument ${JSON.stringify(arg)}. Use --help for usage.`);
  }
  return options;
}

async function discoverRoot() {
  let directory = process.cwd();
  for (;;) {
    let contents;
    try {
      contents = await readFile(join(directory, "package.json"), "utf8");
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
    }
    if (contents !== undefined) {
      let marker;
      try { marker = JSON.parse(contents); } catch { /* Not a usable vault marker. */ }
      if (marker?.researchWiki === true) return directory;
    }
    const parent = dirname(directory);
    if (directory === parent) throw new Error("No vault found: run inside a vault with \"researchWiki\": true in package.json, or supply --root PATH.");
    directory = parent;
  }
}

const args = process.argv.slice(2);
let options;
let root;
let phase = "usage";
const controller = new AbortController();
const cancel = () => controller.abort(new Error("Wiki check cancelled."));
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
try {
  options = parseArguments(args);
  if (options.help) {
    console.log(options.json ? JSON.stringify({ usage: USAGE }) : USAGE);
  } else {
    phase = "operational";
    root = options.root ?? await discoverRoot();
    const { checkVault, formatCheckResult } = await import("./vault.js");
    const result = { root, ...await checkVault(root, controller.signal) };
    console.log(options.json ? JSON.stringify(result, null, 2) : formatCheckResult(result));
    process.exitCode = !result.ok || (options.strict && result.diagnostics.some((item) => item.severity === "warning")) ? 1 : 0;
  }
} catch (error) {
  const failure = {
    root: root ?? options?.root ?? null,
    ok: false,
    stats: null,
    diagnostics: [{ code: `${phase}_error`, severity: "error", path: root ?? options?.root ?? ".", message: error.message }],
  };
  if (options?.json || args.includes("--json")) console.log(JSON.stringify(failure, null, 2));
  else console.error(`Wiki check: FAILED\n${failure.diagnostics[0].path}: error [${phase}_error] ${error.message}`);
  process.exitCode = 2;
} finally {
  process.removeListener("SIGINT", cancel);
  process.removeListener("SIGTERM", cancel);
}
