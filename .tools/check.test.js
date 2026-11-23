import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./check.js", import.meta.url));
const source = "---\ntitle: CLI\ntype: source\nprovenance: personal\n---\n";
const marker = JSON.stringify({ researchWiki: true });

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "research-wiki-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "sources"));
  await writeFile(join(root, "sources", "a.md"), source);
  await mkdir(join(root, ".tools"));
  await writeFile(join(root, ".tools", "package.json"), marker);
  return root;
}

function cli(cwd, ...args) {
  return spawnSync(process.execPath, [relative(cwd, script), ...args], { cwd, encoding: "utf8" });
}
function json(result, exit) {
  assert.equal(result.status, exit, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

test("discovery uses the nearest marked cwd ancestor, not the script's vault", async (t) => {
  const root = await fixture(t);
  const inner = join(root, "other");
  const cwd = join(inner, "nested");
  await mkdir(cwd, { recursive: true });
  await mkdir(join(inner, ".tools"));
  await writeFile(join(inner, ".tools", "package.json"), JSON.stringify({ researchWiki: "true" }));
  assert.equal(json(cli(cwd, "--json"), 0).root, root);

  await writeFile(join(inner, ".tools", "package.json"), marker);
  const empty = json(cli(cwd, "--json"), 1);
  assert.equal(empty.root, inner);
  assert.equal(empty.stats.pages, 0);
  assert.equal(empty.diagnostics[0].code, "pages_missing");
});

test("an isolated page warns normally, fails in strict mode; broken links always fail", async (t) => {
  const root = await fixture(t);
  const normal = cli(root);
  assert.equal(normal.status, 0);
  assert.match(normal.stdout, /OK WITH WARNINGS/);
  const strict = json(cli(root, "--json", "--strict"), 1);
  assert.equal(strict.ok, true);
  assert.equal(strict.diagnostics[0].code, "page_isolated");

  await writeFile(join(root, "sources", "a.md"), source + "[missing](/sources/b.md)");
  const broken = json(cli(root, "--json"), 1);
  assert.equal(broken.ok, false);
  assert.ok(broken.diagnostics.some((d) => d.code === "link_missing" && d.line === 6));
});

test("outside a marked vault, --root selects a directory relative to cwd", async (t) => {
  const root = await fixture(t);
  await rm(join(root, ".tools", "package.json"));
  const missing = json(cli(root, "--json"), 2);
  assert.equal(missing.ok, false);
  assert.equal(missing.stats, null);
  assert.equal(missing.diagnostics[0].code, "operational_error");
  assert.match(missing.diagnostics[0].message, /No vault found/);
  assert.equal(json(cli(join(root, "sources"), "--root", "..", "--json"), 0).root, root);

  const absent = cli(root, "--root", "absent");
  assert.equal(absent.status, 2);
  assert.equal(absent.stdout, "");
  assert.match(absent.stderr, /operational_error/);
});

test("help succeeds; unknown options and missing root values are usage errors", () => {
  const cwd = process.cwd();
  assert.match(json(cli(cwd, "--json", "--help"), 0).usage, /--root/);
  for (const option of ["--unknown", "--root"]) {
    const invalid = json(cli(cwd, "--json", option), 2);
    assert.equal(invalid.diagnostics[0].code, "usage_error");
    assert.equal(invalid.stats, null);
  }
});
