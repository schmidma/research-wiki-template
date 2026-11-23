---
name: zotero
description: Operate a running Zotero library with the zot command-line tool. Use whenever the user asks to search, inspect, export, create, update, organize, or delete Zotero library content, including notes and annotations.
---

# Zotero

Use `zot` for Zotero library operations.

## Approach

1. Run `zot doctor` when the task depends on endpoint capabilities, especially before writes.
2. Use `zot --help` and `zot <command> --help` to discover the current command surface and exact options.
3. Inspect the relevant library objects before planning a change.
4. If `zot` does not support the requested operation, explain the limitation and offer a Zotero UI workflow instead of making a partial change.

Default to the local endpoint and selected user library. Use `--web`, `--url`, or `-L` only when the task requires another endpoint or library. Keep credentials out of commands and responses.

## Output

Prefer stable machine output for automation:

```bash
zot --json <command>
zot --jsonl <command>
```

Global flags precede the command. Use `--raw` only when an essential field is absent from stable output; treat raw Zotero responses as unversioned and avoid building durable workflows around their shape.

## Writes

For every write:

1. Inspect the current object and related records.
2. Prepare the smallest required input.
3. Run the corresponding `--dry-run` when available.
4. Present the planned change and obtain authorization unless the user's current request already authorizes that exact write.
5. Apply the write with `--yes` when required.
6. Read the affected object again and verify the intended result.

Search for likely duplicates before creating bibliographic records. Treat library-wide operations, including tag deletion, as destructive and verify their scope explicitly.
