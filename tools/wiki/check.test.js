import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./check.js", import.meta.url));
const source = "---\ntitle: CLI\ntype: source\nprovenance: personal\n---\n";
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "research-wiki-cli-"));
  try {
    await mkdir(join(root, "sources"));
    await mkdir(join(root, "deep", "nested"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "research-notes", researchWiki: true }));
    await writeFile(join(root, "sources", "a.md"), source);
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
const cli = (cwd, args = [], path = script) => spawnSync(process.execPath, [path, ...args], { cwd, encoding: "utf8" });
function json(result, exit) {
  assert.equal(result.status, exit, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

test("CLI discovers root from subdirectories; warnings allowed or strict, JSON and human output", async () => {
  await fixture(async (root) => {
    const result = json(cli(join(root, "deep", "nested"), ["--json"]), 0);
    assert.equal(result.root, root);
    assert.equal(result.ok, true);
    assert.equal(result.stats.pages, 1);
    assert.equal(result.diagnostics[0].code, "page_isolated");
    const strict = json(cli(root, ["--strict", "--json"]), 1);
    assert.equal(strict.ok, true);
    assert.equal(cli(root).status, 0);
    assert.match(cli(root).stdout, /OK WITH WARNINGS/);
    await writeFile(join(root, "sources", "a.md"), source + "[missing](/sources/b.md)");
    const failed = json(cli(root, ["--json"]), 1);
    assert.equal(failed.ok, false);
    assert.ok(failed.diagnostics.some((d) => d.code === "link_missing" && d.line === 6));
    assert.equal(cli(root).status, 1);
  });
});

test("discovery skips unmarked packages and selects the nearest explicitly marked vault", async () => {
  await fixture(async (root) => {
    const inner = join(root, "deep");
    const cwd = join(inner, "nested");
    await writeFile(join(inner, "package.json"), JSON.stringify({ name: "unrelated-package", private: true }));
    assert.equal(json(cli(cwd, ["--json"]), 0).root, root);
    await writeFile(join(inner, "package.json"), JSON.stringify({ researchWiki: "true" }));
    assert.equal(json(cli(cwd, ["--json"]), 0).root, root);
    await writeFile(join(inner, "package.json"), JSON.stringify({ researchWiki: true }));
    await mkdir(join(inner, "sources"));
    await writeFile(join(inner, "sources", "a.md"), source);
    assert.equal(json(cli(cwd, ["--json"]), 0).root, inner);
  });
});

test("explicit root bypasses package marker and resolves relative to cwd", async () => {
  await fixture(async (root) => {
    await rm(join(root, "package.json"));
    const result = json(cli(join(root, "deep"), ["--root", "..", "--json"]), 0);
    assert.equal(result.root, root);
    assert.equal(json(cli(dirname(root), ["--root", root, "--json"]), 0).stats.pages, 1);
  });
});

test("relative script invocation discovers the working-directory vault, not the script's repository", async () => {
  await fixture(async (root) => {
    const cwd = join(root, "deep");
    const result = json(cli(cwd, ["--json"], relative(cwd, script)), 0);
    assert.equal(result.root, root);
    assert.equal(result.stats.pages, 1);
  });
});

test("outside vault and operational failures return exit 2 and structured machine-only JSON", async () => {
  await fixture(async (root) => {
    await rm(join(root, "package.json"));
    const missingVault = json(cli(root, ["--json"]), 2);
    assert.equal(missingVault.ok, false);
    assert.equal(missingVault.stats, null);
    assert.match(missingVault.diagnostics[0].message, /No vault found/);
    const badRoot = json(cli(root, ["--json", "--root", "absent"]), 2);
    assert.equal(badRoot.diagnostics[0].code, "operational_error");
    await writeFile(join(root, "sources", "large.md"), "x".repeat(1024 * 1024 + 1));
    const tooLarge = json(cli(root, ["--json", "--root", root]), 2);
    assert.match(tooLarge.diagnostics[0].message, /1 MiB/);
    assert.equal(tooLarge.stats, null);
    const human = cli(root, ["--root", "absent"]);
    assert.equal(human.status, 2);
    assert.equal(human.stdout, "");
    assert.match(human.stderr, /operational_error/);
  });
});

test("CLI rejects unknown options and missing values, provides help, and empty vault is invalid", async () => {
  await fixture(async (root) => {
    for (const args of [["--unknown"], ["--root"], ["--root", "--strict"], ["stray"], ["--root", root, "--root", root]]) {
      const result = json(cli(root, [...args, "--json"]), 2);
      assert.equal(result.diagnostics[0].code, "usage_error");
      assert.equal(result.stats, null);
    }
    assert.equal(cli(root, ["--help"]).status, 0);
    assert.match(cli(root, ["--help"]).stdout, /^Usage:/);
    assert.match(json(cli(root, ["--json", "--help"]), 0).usage, /^Usage:/);
    await rm(join(root, "sources", "a.md"));
    const empty = json(cli(root, ["--json"]), 1);
    assert.equal(empty.stats.pages, 0);
    assert.equal(empty.diagnostics[0].code, "pages_missing");
  });
});
