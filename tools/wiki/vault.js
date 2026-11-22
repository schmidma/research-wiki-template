import { lstat, readdir, readFile, readlink, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isMap, LineCounter, parseDocument } from "yaml";
import { fromMarkdown } from "mdast-util-from-markdown";

export const PAGE_TYPES = {
  analyses: "analysis",
  concepts: "concept",
  entities: "entity",
  sources: "source",
  syntheses: "synthesis",
};
const MAX_FILE_BYTES = 1024 * 1024;
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const lineAt = (text, offset) => text.slice(0, offset).split("\n").length;
const diagnostic = (code, severity, path, line, message) => ({
  code, severity, path, ...(line === undefined ? {} : { line }), message,
});

function abortIfRequested(signal) {
  signal?.throwIfAborted();
}

function parsePage(path, text) {
  const diagnostics = [];
  const page = { path, text, body: text, bodyOffset: 0, fields: new Map(), fieldLines: new Map(), diagnostics };
  const opening = /^---[ \t]*\r?\n/.exec(text);
  if (!opening) {
    diagnostics.push(diagnostic("frontmatter_missing", "error", path, 1, "Start the page with a --- YAML frontmatter block."));
    return page;
  }
  const closing = /^---[ \t]*\r?$/gm;
  closing.lastIndex = opening[0].length;
  const end = closing.exec(text);
  if (!end) {
    diagnostics.push(diagnostic("frontmatter_unterminated", "error", path, 1, "Close the YAML frontmatter with a line containing --- (three hyphens)."));
    // An unterminated metadata block is not Markdown body.
    page.body = "";
    page.bodyOffset = text.length;
    return page;
  }
  page.bodyOffset = end.index + end[0].length;
  if (text[page.bodyOffset] === "\n") page.bodyOffset += 1;
  page.body = text.slice(page.bodyOffset);
  const yaml = text.slice(opening[0].length, end.index);
  const lineCounter = new LineCounter();
  const doc = parseDocument(yaml, { lineCounter, prettyErrors: false, uniqueKeys: true });
  for (const error of [...doc.errors, ...doc.warnings]) {
    const pos = lineCounter.linePos(error.pos[0]);
    diagnostics.push(diagnostic(
      doc.errors.includes(error) ? "yaml_invalid" : "yaml_warning",
      doc.errors.includes(error) ? "error" : "warning", path, pos.line + 1,
      `YAML ${error.code} at column ${pos.col}: ${error.message}`,
    ));
  }
  if (doc.errors.length) return page;
  if (!isMap(doc.contents)) {
    diagnostics.push(diagnostic("frontmatter_not_mapping", "error", path, 2, "YAML frontmatter must be a mapping of field names to values."));
    return page;
  }
  try {
    const fields = doc.toJS({ mapAsMap: true });
    if (!(fields instanceof Map)) {
      diagnostics.push(diagnostic("frontmatter_not_mapping", "error", path, 2, "YAML frontmatter must resolve to a mapping of field names to values."));
      return page;
    }
    page.fields = fields;
  } catch (error) {
    diagnostics.push(diagnostic("yaml_invalid", "error", path, 2, `Cannot resolve YAML values: ${error.message}`));
    return page;
  }
  for (const pair of doc.contents.items) {
    if (pair.key?.range) page.fieldLines.set(pair.key.value, lineCounter.linePos(pair.key.range[0]).line + 1);
  }
  return page;
}

async function walkMarkdown(directory, root, files, signal) {
  abortIfRequested(signal);
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => compare(a.name, b.name));
  for (const entry of entries) {
    abortIfRequested(signal);
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) await walkMarkdown(absolute, root, files, signal);
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(relative(root, absolute).split(sep).join("/"));
  }
}

export async function loadPages(root, signal) {
  const absoluteRoot = await realpath(resolve(root));
  if (!(await lstat(absoluteRoot)).isDirectory()) throw new Error(`Not a directory: ${root}`);
  const files = [];
  for (const directory of Object.keys(PAGE_TYPES)) {
    abortIfRequested(signal);
    let stat;
    try {
      stat = await lstat(join(absoluteRoot, directory));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (stat.isSymbolicLink()) continue;
    if (!stat.isDirectory()) throw new Error(`Canonical page directory is not a directory: ${directory}`);
    await walkMarkdown(join(absoluteRoot, directory), absoluteRoot, files, signal);
  }
  const pages = [];
  for (const path of files.sort(compare)) {
    abortIfRequested(signal);
    const absolute = join(absoluteRoot, path);
    const stat = await lstat(absolute);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    if (stat.size > MAX_FILE_BYTES) throw new Error(`${path} exceeds the 1 MiB page limit`);
    const text = await readFile(absolute, { encoding: "utf8", signal });
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new Error(`${path} exceeds the 1 MiB page limit`);
    pages.push(parsePage(path, text));
  }
  return pages;
}

function* nodes(tree) {
  // Iterative traversal avoids a checker-side recursion limit on nested input.
  const stack = [tree];
  while (stack.length) {
    const node = stack.pop();
    yield node;
    if (node.children) for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
  }
}

function maskLiterals(body, tree) {
  const masked = body.split("");
  for (const node of nodes(tree)) {
    if (!["code", "inlineCode", "html"].includes(node.type)) continue;
    for (let i = node.position.start.offset; i < node.position.end.offset; i++) {
      if (masked[i] !== "\n" && masked[i] !== "\r") masked[i] = " ";
    }
  }
  return masked.join("");
}

function isEscaped(text, index) {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 1;
}

function mathDelimiters(masked) {
  const counts = { inlineOpen: 0, inlineClose: 0, displayOpen: 0, displayClose: 0 };
  const keys = { "\\(": "inlineOpen", "\\)": "inlineClose", "\\[": "displayOpen", "\\]": "displayClose" };
  let firstOffset;
  for (let i = 0; i < masked.length - 1; i++) {
    const key = keys[masked.slice(i, i + 2)];
    // Preserve the old convention: a backslash preceded by another backslash
    // is a literal example, not a math delimiter.
    if (!key || masked[i - 1] === "\\") continue;
    counts[key]++;
    firstOffset ??= i;
    i++;
  }
  return firstOffset === undefined ? undefined : { ...counts, firstOffset };
}

function localTarget(source, url) {
  if (!url || url.startsWith("#") || url.startsWith("//") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(url)) return {};
  let path;
  try {
    // Split fragments/queries before decoding: %23 can be part of a filename.
    path = decodeURIComponent(url.split(/[?#]/, 1)[0]);
  } catch {
    return { isMarkdown: url.split(/[?#]/, 1)[0].endsWith(".md"), error: "link_encoding_invalid", message: `Invalid percent encoding in local target ${JSON.stringify(url)}.` };
  }
  if (!path) return {};
  if (path.includes("\0")) return { error: "link_target_invalid", message: "Local target contains a NUL character." };
  // Treat encoded backslashes as separators as well, so traversal is portable.
  path = path.replaceAll("\\", "/");
  const vaultRoot = path.startsWith("/");
  const isMarkdown = path.endsWith(".md");
  const prefix = vaultRoot ? "" : `${source.split("/").slice(0, -1).join("/")}/`;
  const traversalPath = `${prefix}${path.replace(/^\/+/, "")}`;
  const segments = vaultRoot ? [] : source.split("/").slice(0, -1);
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!segments.length) return { isMarkdown, error: "link_escaping_root", message: `Target escapes the repository: ${JSON.stringify(url)}.` };
      segments.pop();
    } else segments.push(segment);
  }
  return { path: segments.join("/"), traversalPath, isMarkdown, relative: !vaultRoot };
}

function inside(root, target) {
  const path = relative(root, target);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

// Inspect every existing prefix, including symlinks with missing descendants.
// A dangling symlink to an external path must not bypass containment checks.
async function inspectTarget(root, path, signal, depth = 0) {
  if (depth > 40) return { error: "link_target_invalid", message: "Local target has a symlink loop or too many symlink indirections." };
  let current = root;
  const segments = path.split("/").filter(Boolean);
  let stat = await lstat(root);
  for (let i = 0; i < segments.length; i++) {
    abortIfRequested(signal);
    current = resolve(current, segments[i]);
    if (!inside(root, current)) return { error: "link_escaping_root", message: "Target escapes the repository during path traversal." };
    try {
      stat = await lstat(current);
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) return { exists: false };
      throw error;
    }
    if (stat.isSymbolicLink()) {
      const link = await readlink(current);
      const target = resolve(dirname(current), link);
      if (!inside(root, target)) return { error: "link_escaping_root", message: `Target escapes the repository through symlink ${relative(root, current)}.` };
      // Keep dot segments: normalizing symlink/.. before inspecting it can
      // conceal an external symlink or change which file the OS would open.
      let targetPath;
      if (isAbsolute(link)) {
        const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
        if (link === root) targetPath = "";
        else if (link.startsWith(prefix)) targetPath = link.slice(prefix.length);
        else return { error: "link_escaping_root", message: "Absolute symlink target traverses outside the repository." };
      } else targetPath = `${relative(root, dirname(current))}/${link}`;
      return inspectTarget(root, [targetPath, ...segments.slice(i + 1)].join("/"), signal, depth + 1);
    }
    if (i < segments.length - 1 && !stat.isDirectory()) return { exists: false };
  }
  return { exists: true, isFile: stat.isFile(), path: relative(root, current).split(sep).join("/") };
}

export async function checkVault(root, signal) {
  abortIfRequested(signal);
  const absoluteRoot = await realpath(resolve(root));
  const pages = await loadPages(absoluteRoot, signal);
  const diagnostics = [];
  const paths = new Set(pages.map((page) => page.path));
  const connected = new Set();
  const edges = new Set();
  const titles = new Map();
  const byType = new Map();
  let links = 0;
  for (const page of pages) {
    abortIfRequested(signal);
    diagnostics.push(...page.diagnostics);
    const add = (code, severity, line, message) => diagnostics.push(diagnostic(code, severity, page.path, line, message));
    const field = (key) => {
      const value = page.fields.get(key);
      if (typeof value !== "string" || !value.trim()) {
        add("metadata_required", "error", page.fieldLines.get(key) ?? 2, `${key} must be a nonblank YAML string.`);
        return undefined;
      }
      return value;
    };
    // Avoid cascading required-field errors when YAML could not be parsed.
    if (!page.diagnostics.some((item) => item.severity === "error")) {
      const title = field("title");
      const type = field("type");
      const expected = PAGE_TYPES[page.path.split("/", 1)[0]];
      if (type) {
        byType.set(type, (byType.get(type) ?? 0) + 1);
        if (type !== expected) add("type_mismatch", "error", page.fieldLines.get("type"), `type ${JSON.stringify(type)} does not match directory type ${expected}.`);
      }
      if (expected === "source") {
        const provenance = field("provenance");
        if (provenance && !["personal", "zotero"].includes(provenance)) add("provenance_invalid", "error", page.fieldLines.get("provenance"), `Unsupported provenance ${JSON.stringify(provenance)}; use personal or zotero.`);
      }
      if (title) {
        const key = title.trim().toLowerCase();
        const group = titles.get(key) ?? [];
        group.push(page);
        titles.set(key, group);
      }
    }
    const tree = fromMarkdown(page.body);
    const masked = maskLiterals(page.body, tree);
    const bodyLine = lineAt(page.text, page.bodyOffset);
    const legacy = [...masked.matchAll(/\[\[[^\]]+\]\]/g)].find((match) => !isEscaped(masked, match.index));
    if (legacy) add("legacy_wikilink", "warning", bodyLine + lineAt(masked, legacy.index) - 1, "Contains legacy wikilinks; use vault-root Markdown links.");
    const math = mathDelimiters(masked);
    if (math) add("math_delimiters", "warning", bodyLine + lineAt(masked, math.firstOffset) - 1,
      `Obsidian-incompatible math delimiters (inline: ${math.inlineOpen} open, ${math.inlineClose} close; display: ${math.displayOpen} open, ${math.displayClose} close); use $...$ and $$...$$.`);
    const definitions = new Map();
    for (const node of nodes(tree)) if (node.type === "definition" && !definitions.has(node.identifier)) definitions.set(node.identifier, node);
    for (const node of nodes(tree)) {
      abortIfRequested(signal);
      let url;
      if (node.type === "link" || node.type === "image") url = node.url;
      else if (node.type === "linkReference" || node.type === "imageReference") url = definitions.get(node.identifier)?.url;
      else continue;
      if (url === undefined) continue;
      const target = localTarget(page.path, url);
      const line = bodyLine + node.position.start.line - 1;
      if (target.isMarkdown) links++;
      if (target.error) {
        add(target.error, "error", line, target.message);
        continue;
      }
      if (target.path === undefined) continue;
      if (target.relative && target.isMarkdown) add("link_relative", "warning", line, `Relative internal link ${JSON.stringify(url)}; prefer /${target.traversalPath}.`);
      const actual = await inspectTarget(absoluteRoot, target.traversalPath, signal);
      if (actual.error) add(actual.error, "error", line, actual.message);
      else if (target.isMarkdown) {
        if (!actual.exists) add("link_missing", "error", line, `Missing target /${target.path}.`);
        else if (!actual.isFile) add("link_not_file", "error", line, `Markdown target /${target.path} is not a file.`);
        else if (paths.has(actual.path) && actual.path !== page.path) {
          connected.add(page.path);
          connected.add(actual.path);
          edges.add(`${page.path}\0${actual.path}`);
        }
      }
    }
  }
  for (const [title, group] of titles) {
    if (group.length < 2) continue;
    for (const page of group) diagnostics.push(diagnostic("title_duplicate", "error", page.path, page.fieldLines.get("title"),
      `Duplicate title ${JSON.stringify(title)}: ${group.map((item) => item.path).join(", ")}. Disambiguate page titles.`));
  }
  let isolatedPages = 0;
  for (const page of pages) {
    if (connected.has(page.path)) continue;
    isolatedPages++;
    diagnostics.push(diagnostic("page_isolated", "warning", page.path, undefined, "Isolated wiki page (no incoming or outgoing canonical Markdown links)."));
  }
  if (!pages.length) diagnostics.push(diagnostic("pages_missing", "error", ".", undefined, `No wiki pages found in ${Object.keys(PAGE_TYPES).join(", ")}.`));
  diagnostics.sort((a, b) => compare(a.path, b.path) || (a.line ?? 0) - (b.line ?? 0) || compare(a.code, b.code) || compare(a.message, b.message));
  return {
    ok: !diagnostics.some((item) => item.severity === "error"),
    stats: { pages: pages.length, byType: Object.fromEntries([...byType].sort(([a], [b]) => compare(a, b))), links, graphEdges: edges.size, isolatedPages },
    diagnostics,
  };
}

export function formatCheckResult(result) {
  const warnings = result.diagnostics.filter((item) => item.severity === "warning").length;
  const lines = [`Wiki check: ${!result.ok ? "FAILED" : warnings ? "OK WITH WARNINGS" : "OK"}`];
  if (result.stats) {
    const { pages, byType, links, graphEdges, isolatedPages } = result.stats;
    lines.push(`Pages: ${pages}`, `Types: ${Object.entries(byType).map(([type, count]) => `${type}=${count}`).join(", ") || "none"}`,
      `Local Markdown link occurrences: ${links}`, `Unique directed canonical graph edges: ${graphEdges}`, `Isolated pages: ${isolatedPages}`);
  }
  for (const item of result.diagnostics) lines.push(`${item.path}${item.line === undefined ? "" : `:${item.line}`}: ${item.severity} [${item.code}] ${item.message}`);
  return lines.join("\n");
}
