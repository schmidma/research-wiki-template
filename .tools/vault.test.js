import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkVault, formatCheckResult } from "./vault.js";

async function withVault(run) {
  const root = await mkdtemp(join(tmpdir(), "research-wiki-check-"));
  try {
    await mkdir(join(root, "sources"));
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
const source = (title, body = "") => `---\ntype: source\ntitle: ${JSON.stringify(title)}\nprovenance: personal\n---\n# ${title}\n${body}`;
const save = (root, name, text) => writeFile(join(root, "sources", name), text);
const errors = (result) => result.diagnostics.filter((d) => d.severity === "error");
const ofCode = (result, code) => result.diagnostics.filter((d) => d.code === code);

test("only visible links count as occurrences and connect distinct canonical pages", async () => {
  await withVault(async (root) => {
    await save(root, "a.md", source("A", [
      "> ```md", "> [[Hidden]] [hidden](/sources/c.md)", "> ```", "",
      "    [[Indented]] [hidden](/sources/c.md)",
      "Inline `[[example]] [hidden](/sources/c.md)`.",
      '![Image](</sources/b.md> "caption")', "[Self](/sources/a.md)",
      "Paragraph continuation:", "    [Relative](b.md)",
      "[Missing](/sources/missing.md)", "[[Visible]]",
    ].join("\n")));
    await save(root, "b.md", source("B"));
    await save(root, "c.md", source("C"));
    const result = await checkVault(root);
    assert.deepEqual(result.stats, { pages: 3, byType: { source: 3 }, links: 4, graphEdges: 1, isolatedPages: 1 });
    assert.deepEqual(errors(result).map((d) => [d.code, d.line]), [["link_missing", 17]]);
    assert.deepEqual(ofCode(result, "legacy_wikilink").map((d) => d.line), [18]);
    assert.deepEqual(ofCode(result, "link_relative").map((d) => d.line), [16]);
    assert.deepEqual(ofCode(result, "page_isolated").map((d) => d.path), ["sources/c.md"]);
  });
});

test("math warnings count visible delimiters, including indented paragraph continuations", async () => {
  await withVault(async (root) => {
    await save(root, "math.md", [
      "---", "title: Math", "type: source", "provenance: personal", String.raw`example: \(metadata\)`, "---",
      "```latex", String.raw`\(fenced\)`, "```",
      " \t\\(indented code\\)", "Inline code: `\\(hidden\\)`.",
      String.raw`Escaped: \\(example\\).`, "<!-- \\(hidden\\) -->",
      "Ordinary paragraph", String.raw`    Visible \(x\) and unmatched \[ token.`,
    ].join("\n"));
    await save(root, "code.md", source("Code example", "Inline code: `\\(hidden\\)`."));
    const result = await checkVault(root);
    assert.equal(result.ok, true);
    const mathWarnings = ofCode(result, "math_delimiters");
    assert.deepEqual(mathWarnings.map((warning) => warning.path), ["sources/math.md"]);
    const [math] = mathWarnings;
    assert.equal(math.line, 15);
    assert.match(math.message, /inline: 1 open, 1 close; display: 1 open, 0 close/);
  });
});

test("valid YAML accepts LF/CRLF, folded titles, comments, nested unknown fields and aliases", async () => {
  await withVault(async (root) => {
    const text = "---\ntitle: >-\n  Multiline\n  title\ntype: source # comment\nprovenance: zotero\nunknown: &data {foo: [true, 123]}\ncopy: *data\n---\n";
    await save(root, "a.md", text);
    assert.equal((await checkVault(root)).ok, true);
    await save(root, "a.md", text.replaceAll("\n", "\r\n") + "[[Legacy]]\r\n[missing](/missing.md)");
    const result = await checkVault(root);
    assert.deepEqual(ofCode(result, "legacy_wikilink").map((d) => d.line), [10]);
    assert.deepEqual(ofCode(result, "link_missing").map((d) => d.line), [11]);
    await save(root, "a.md", text.trimEnd()); // Closing delimiter at EOF.
    assert.equal((await checkVault(root)).ok, true);
  });
});

test("invalid YAML and metadata have actionable lines, without misleading string coercion", async () => {
  await withVault(async (root) => {
    const cases = [
      ["no frontmatter", "frontmatter_missing", 1],
      ["---\ntitle: A", "frontmatter_unterminated", 1],
      ["---\n- title\n- source\n---\n", "frontmatter_not_mapping", 2],
      ["---\n!!set {title, type}\n---\n", "frontmatter_not_mapping", 2],
      ["---\ntitle: A\ntitle: B\ntype: source\n---\n", "yaml_invalid", 3],
      ["---\ntitle: [broken\n---\n", "yaml_invalid", 3],
      ["---\ntitle: 123\ntype: source\nprovenance: personal\n---\n", "metadata_required", 2],
      ["---\ntitle: A\ntype: false\nprovenance: personal\n---\n", "metadata_required", 3],
      ["---\ntitle: A\ntype: source\nprovenance: [personal]\n---\n", "metadata_required", 4],
      ["---\ntitle: '  '\ntype: source\nprovenance: personal\n---\n", "metadata_required", 2],
      ["---\ntitle: A\ntype: concept\nprovenance: personal\n---\n", "type_mismatch", 3],
      ["---\ntitle: A\ntype: source\nprovenance: other\n---\n", "provenance_invalid", 4],
      ["---\n{}\n---\n", "metadata_required", 2],
    ];
    for (const [text, code, line] of cases) {
      await save(root, "a.md", text);
      const result = await checkVault(root);
      assert.equal(result.ok, false, text);
      assert.ok(ofCode(result, code).some((d) => d.line === line), JSON.stringify(result.diagnostics));
    }
  });
});

test("titles are unique after trim and case folding, isolated self-links are warnings", async () => {
  await withVault(async (root) => {
    await save(root, "a.md", source(" Title ", "[self](/sources/a.md)"));
    await save(root, "b.md", source("TITLE"));
    const result = await checkVault(root);
    assert.equal(result.ok, false);
    assert.equal(ofCode(result, "title_duplicate").length, 2);
    assert.equal(ofCode(result, "title_duplicate")[0].line, 3);
    assert.equal(result.stats.isolatedPages, 2);
    assert.equal(result.stats.graphEdges, 0);
  });
});

test("reference links use occurrence lines, first definitions, and CommonMark identifier normalization", async () => {
  await withVault(async (root) => {
    await save(root, "a.md", source("A", [
      "[Full][ Mixed   CASE ]", "[Collapsed][]", "[Shortcut]", "![Image][Mixed case]", "[Missing][bad]",
      "", '[mixed case]: </sources/b.md> "optional title"', "[mixed case]: /missing-duplicate.md",
      "[Collapsed]: /sources/b.md", "[Shortcut]: /README.md", "[bad]: /missing.md",
      "", "`[Code][bad]`", "", "    [Hidden][bad]", "    [hidden]: /missing.md",
    ].join("\n")));
    await save(root, "b.md", source("B"));
    await writeFile(join(root, "README.md"), "No metadata needed here.");
    const result = await checkVault(root);
    assert.equal(result.stats.links, 5);
    assert.equal(result.stats.graphEdges, 1);
    assert.equal(result.stats.isolatedPages, 0);
    assert.deepEqual(errors(result).map((d) => [d.code, d.line]), [["link_missing", 11]]);
  });
});

test("encoded filenames, encoded separators/traversal, anchors, external URIs and non-file targets", async () => {
  await withVault(async (root) => {
    await mkdir(join(root, "sources", "folder.md"));
    await save(root, "b space#(x).md", source("B"));
    await writeFile(join(root, "README.md"), "readme");
    await save(root, "a.md", source("A", [
      '[Encoded](/sources%2Fb%20space%23(x).md#not-validated "title")', "[readme](/README.md)",
      "[escape](%2e%2e/%2e%2e/secret.txt)", "[root escape](/%2e%2e/sources/a.md)",
      "[backslash](%2e%2e%5c%2e%2e%5csecret.txt)", "[bad encoding](/sources/%xx.md)",
      "[folder](/sources/folder.md)", "[nonexistent asset](/assets/not-there.png)",
      "[web](https://example.com/no.md)", "[URI](mailto:test@example.com)", "[anchor](#heading)",
      "[network](//example.com/no.md)",
    ].join("\n")));
    const result = await checkVault(root);
    assert.equal(result.stats.graphEdges, 1);
    assert.equal(ofCode(result, "link_escaping_root").length, 3);
    assert.equal(ofCode(result, "link_encoding_invalid").length, 1);
    assert.equal(ofCode(result, "link_not_file").length, 1);
    assert.equal(ofCode(result, "link_missing").length, 0);
  });
});

test("symlink containment includes attachments, dangling links, and missing descendants", async () => {
  await withVault(async (root) => {
    const outside = await mkdtemp(join(tmpdir(), "research-wiki-outside-"));
    try {
      await writeFile(join(outside, "paper.md"), "external");
      await symlink(outside, join(root, "external"));
      await symlink(join(outside, "absent"), join(root, "dangling"));
      await symlink(join(root, "sources"), join(root, "internal"));
      await symlink("loop", join(root, "loop"));
      await writeFile(join(root, "README.md"), "readme");
      await save(root, "b.md", source("B"));
      await save(root, "a.md", source("A", [
        "[external](/external/paper.md)", "[missing child](/external/none.png)",
        "[dangling](/dangling/none.txt)", "[internal](/internal/b.md)", "[loop](/loop/a.md)",
        "[external before dot](/external/../README.md)", "[internal dot](/internal/../README.md)",
        "[missing before dot](/not-present/../README.md)",
        "[file before dot](/README.md/../sources/b.md)",
      ].join("\n")));
      const result = await checkVault(root);
      assert.equal(ofCode(result, "link_escaping_root").length, 4);
      assert.equal(ofCode(result, "link_target_invalid").length, 1);
      assert.equal(ofCode(result, "link_missing").length, 2);
      assert.equal(result.stats.graphEdges, 1);
    } finally { await rm(outside, { recursive: true, force: true }); }
  });
});

test("recursive canonical-only scan excludes hidden and symlink entries without a page cap", async () => {
  await withVault(async (root) => {
    await mkdir(join(root, "sources", "nested"));
    await mkdir(join(root, "sources", ".hidden"));
    await mkdir(join(root, "elsewhere"));
    await writeFile(join(root, "sources", "nested", "deep.md"), source("Deep"));
    await writeFile(join(root, "sources", ".hidden", "bad.md"), "invalid");
    await save(root, ".bad.md", "invalid");
    await writeFile(join(root, "elsewhere", "bad.md"), "invalid");
    await symlink(join(root, "elsewhere"), join(root, "sources", "linked"));
    await symlink(join(root, "elsewhere", "bad.md"), join(root, "sources", "linked.md"));
    await Promise.all(Array.from({ length: 501 }, (_, i) => save(root, `${i}.md`, source(`Page ${i}`))));
    const result = await checkVault(root);
    assert.equal(result.stats.pages, 502);
    assert.equal(result.ok, true);
  });
});

test("operational failures and cancellation reject rather than return validation success", async () => {
  await withVault(async (root) => {
    await assert.rejects(checkVault(join(root, "absent")), { code: "ENOENT" });
    await assert.rejects(checkVault(root, AbortSignal.abort(new Error("cancelled"))), /cancelled/);
    await save(root, "huge.md", " ".repeat(1024 * 1024 + 1));
    await assert.rejects(checkVault(root), /1 MiB/);
    await rm(join(root, "sources", "huge.md"));
    await writeFile(join(root, "analyses"), "not a directory");
    await assert.rejects(checkVault(root), /not a directory/);
  });
});

test("canonical-directory permission errors propagate", { skip: process.getuid?.() === 0 ? "root bypasses permissions" : false }, async () => {
  await withVault(async (root) => {
    await chmod(root, 0);
    try { await assert.rejects(checkVault(root), { code: "EACCES" }); }
    finally { await chmod(root, 0o700); }
  });
});

test("format distinguishes failure, warnings and clean success", () => {
  const result = { ok: true, stats: { pages: 1, byType: { source: 1 }, links: 0, graphEdges: 0, isolatedPages: 1 }, diagnostics: [] };
  assert.match(formatCheckResult(result), /^Wiki check: OK$/m);
  assert.match(formatCheckResult({ ...result, diagnostics: [{ code: "test", severity: "warning", path: "sources/a.md", line: 2, message: "warning" }] }), /^Wiki check: OK WITH WARNINGS$/m);
  assert.match(formatCheckResult({ ...result, ok: false }), /^Wiki check: FAILED$/m);
});
