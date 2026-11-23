# Research wiki

A starter workspace for agent-assisted research using ordinary Markdown, Obsidian, Zotero, and Git. Use it to connect sources and observations to projects, concepts, focused analyses, and broader syntheses.

The agent is a research collaborator, not an automatic note collector. Discussion need not produce files, and a plausible interpretation is not an established result. The operating rules in [AGENTS.md](AGENTS.md) make those distinctions explicit.

## Start your own workspace

1. On GitHub, choose **Use this template** and create a **private repository** for your research. Clone your new repository, not the template.
2. Read [AGENTS.md](AGENTS.md) before starting an agent. In particular, it authorizes automatic commits and pushes to your workspace's configured upstream after completed, checked tasks. Confirm that the remote is your intended private backup; adapt the instructions before use if that policy does not suit you.
3. Open the cloned repository root as an existing vault in Obsidian, or browse it in a Markdown editor. No build is required to read or edit the pages.
4. For validation, install Node.js 22 or newer and run these commands from the repository root:

   ```sh
   npm --prefix .tools ci
   node .tools/check.js --strict
   npm --prefix .tools test
   ```

5. Explore the [example project](entities/example-project.md), then follow [Replace the examples](#replace-the-examples) to start your own research record. All six example pages are explicitly fictional; they are not research evidence.

Automatic Git backup also requires a configured author name and email, credentials with write access to your private repository, and an upstream tracking branch. Check the destination with `git remote -v` and tracking with `git branch -vv`; confirm repository visibility on GitHub before the first agent task.

The repository's directory name and npm package name are yours to choose. Keep `"researchWiki": true` in `.tools/package.json` so the checker can discover the vault. Keep `"private": true` to prevent accidental npm publication; it does **not** make a Git repository private.

## How the pages fit together

| Directory | Purpose | Example |
| --- | --- | --- |
| `sources/` | Source-specific evidence, interpretations, and personal observations | [Changing-temperature observation](sources/example-temperature-observation.md), [fixed-temperature observation](sources/example-fixed-temperature-observation.md) |
| `entities/` | Named projects, people, organizations, systems, and tools | [Sensor comparison project](entities/example-project.md) |
| `concepts/` | Ideas and working definitions that recur across pages | [Sensor drift](concepts/example-concept.md) |
| `analyses/` | Reasoned answers to focused questions | [What explains the changing difference?](analyses/example-analysis.md) |
| `syntheses/` | Interpretations integrating multiple sources or projects | [What the observations jointly support](syntheses/example-synthesis.md) |

The example follows an observation through competing explanations to a proposed experiment. It keeps the proposal separate from the invented observations and avoids presenting a causal conclusion as established.

Each canonical page has YAML frontmatter:

```yaml
---
title: A unique descriptive title
type: source
provenance: personal
---
```

Use `source`, `entity`, `concept`, `analysis`, or `synthesis` to match the directory. Source pages additionally require `provenance: personal` or `provenance: zotero`. Other useful metadata is allowed. Titles must be unique after trimming whitespace and ignoring case.

Internal links use vault-root Markdown paths, such as `[Example concept](/concepts/example-concept.md)`. These links are intended for the local vault, not a GitHub-hosted website. Use `$...$` for inline math and `$$...$$` for display math.

When creating links in Obsidian, disable **Use [[Wikilinks]]** under **Settings > Files and links** to generate Markdown links. Inspect generated destinations and adjust them to the vault-root form above, including the leading `/` and `.md` extension; disabling wikilinks alone does not guarantee that path format. On each device, check a cross-folder link by opening its target and checking the backlink, then run `node .tools/check.js`. Link validation does not test Obsidian navigation. See [Obsidian's link documentation](https://help.obsidian.md/links).

## Replace the examples

Start with what you actually know, not with a requirement to fill every directory:

1. Create a real observation in `sources/` using the minimal frontmatter above and `provenance: personal`. Record the observation, recollection, or question and distinguish it from your interpretation. You do not need a polished project narrative to begin.
2. If the observation has a genuine relationship to a project or concept, create or update that page and link them. Otherwise, leave it unconnected for now. Do not invent relationships to make a check pass.
3. Remove the six fictional pages linked in the example table once you no longer need them. Remove or replace the example links in this README as well, including the setup link and the table's example column. Keep any real pages you have added; do not delete whole directories as a shortcut.
4. Run `node .tools/check.js` without `--strict` for normal research work. A lone observation is valid but produces an isolation warning. Review warnings as curation prompts, not an obligation to expand the wiki. An entirely empty vault fails validation.

Strict mode is useful for keeping the shipped example coherent; it is not a minimum standard of research maturity.

## Work with an agent

Start a file-and-shell agent in the vault root and ensure it loads `AGENTS.md`. If your tool does not discover that file automatically, ask it to read the file first. No particular agent provider or subscription is required by the repository.

A first conversation might begin:

> Read AGENTS.md. Help me clarify the question behind my current project. Distinguish what I remember, what the available sources support, and what remains uncertain. Discuss what is worth preserving before writing a project page. Do not treat the example pages as evidence about my work.

Give the agent access only to material you are permitted to share with its provider. Web search, PDF retrieval and extraction, and subagents depend on your agent environment; this template does not install or configure them. There is no bundled search index, vector database, or generated registry. Ordinary filesystem search is sufficient to get started.

## Bibliography and PDFs

The supplied workflow uses **Zotero** for bibliographic records, PDFs, annotations, and citation keys. The wiki holds interpretation and connections between sources. You do not need Zotero to explore the fictional examples, but identify real bibliographic sources in Zotero before creating their wiki pages under these instructions.

Use source pages with `provenance: zotero` and preserve the real item's identifiers and useful metadata. Do not invent keys or copy someone else's library identifiers. The example vault intentionally contains no fake Zotero records. PDFs stay in Zotero, not in this repository.

### A bibliographic source page

After identifying the canonical item in your own Zotero library, a source page can look like this. Replace the placeholders with verified metadata; do not save them as if they were real identifiers. Omit `citation_key` if the item has no citation key.

```markdown
---
title: "REPLACE_WITH_A_UNIQUE_SOURCE_TITLE"
type: source
provenance: zotero
zotero_item_key: "REPLACE_WITH_YOUR_VERIFIED_ITEM_KEY"
zotero_uri: "REPLACE_WITH_YOUR_VERIFIED_ITEM_URI"
citation_key: "REPLACE_WITH_YOUR_EXISTING_CITATION_KEY"
---

## Source claim

Summarize the relevant claim and identify its page or passage in the source.

## Interpretation and relevance

Separate your inference from the source's claim. Note limitations and explain
which research question it informs. Link to an existing project or analysis
when there is a genuine relationship.
```

Only `title`, `type`, and `provenance` are required by the checker for a source page. The pointer fields above are suggested metadata, not an enforced schema; preserve useful existing metadata rather than renaming it to match the example. The checker does not verify Zotero identifiers or citations.

### Optional agent access through zotgo

[zotgo](https://github.com/heibench/zotgo) supplies the `zot` CLI for a running Zotero desktop application. It is not installed by `npm --prefix .tools ci`.

1. Install a binary for your platform from the [v0.12.0 release](https://github.com/heibench/zotgo/releases/tag/v0.12.0), verify it against the release checksums, and place `zot` on your `PATH`.
2. Keep Zotero 7 or newer running. In its advanced settings, enable **Allow other applications on this computer to communicate with Zotero**. See the [Zotero Local API documentation](https://www.zotero.org/support/dev/web_api/v3/local_api).
3. Run `zot doctor` to check the local endpoint and its capabilities, then `zot --help` for available commands. Local reading does not require a Web API key or a separate Zotero plugin.
4. Tell your agent to use `zot` for Zotero access, inspect command help before use, and prefer `zot --json ...` for structured output. The default workflow uses your personal library, not group libraries.

Reading and writing are separate capabilities. Writes need a Zotero build with a supported local write API and explicit authorization; non-interactive writes also require a human-granted lease. Follow the [zotgo writing guide](https://github.com/heibench/zotgo/blob/v0.12.0/docs/writing.md) only when you intend to enable them. A technical permission or lease does not replace the explicit user request required by `AGENTS.md`.

## Optional Obsidian title display

Obsidian works without community plugins. To display frontmatter titles rather than filenames in the file explorer and graph:

1. In **Settings > Community plugins > Browse**, install and enable [Front Matter Title](https://github.com/snezhig/obsidian-front-matter-title).
2. Leave **Common main template** set to `title`.
3. Enable **Explorer** and **Graph**. Other features are not required for this setup.

The original setup uses plugin 4.1.1, which requires Obsidian 1.12.0 or newer. Consult the plugin's compatibility information when installing another version. These display features do not rename files or rewrite links.

`.obsidian/` is ignored by Git, so each device needs its own preferences and plugin setup. Workspace history and installed plugin code are not part of the template.

## Check the wiki

```sh
node .tools/check.js          # errors fail; warnings are allowed
node .tools/check.js --strict # warnings also fail
node .tools/check.js --json   # structured diagnostics
node .tools/check.js --help
```

The checker validates frontmatter, directory/type consistency, unique titles, local Markdown targets, and repository containment. It warns about isolated pages, legacy wikilinks, relative links, and non-Obsidian math delimiters. It does not check scientific claims, external URLs, heading fragments, or attachment existence, and it never changes pages.

Root discovery walks the working directory's ancestors to the nearest `.tools/package.json` with `"researchWiki": true`. From a subdirectory, invoke the script using the appropriate relative or absolute path. `--root PATH` bypasses discovery and resolves relative to the working directory. Exit codes are 0 for success, 1 for validation failure, and 2 for usage or operational failure; strict mode treats warnings as validation failure.

Git backs up only tracked files. Zotero data, PDFs, installed dependencies, and local Obsidian state need their own backup arrangements. Never commit credentials or publish the research vault merely to share this setup.

## Later improvements

Creating a repository from this template gives you a starting snapshot, not automatic updates. Your research pages and customized operating rules remain yours to maintain.

When adopting a later improvement, inspect the relevant template changes and port only what you need. Keep package identity, personal policies, and research content intact; do not replace your whole vault or `AGENTS.md`. To suggest improvements to the template, see [Contributing](CONTRIBUTING.md).

## License

The template's code, instructions, documentation, and examples are available under the [MIT License](LICENSE). This does not require you to publish your own research notes. Third-party dependencies retain their own licenses.
