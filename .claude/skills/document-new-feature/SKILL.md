---
name: document-new-feature
description: When implementing a new feature, also update the docs (local `docs/` and readme.io). Model-invoked: fires automatically on feature work.
---

## What this is

Every new feature, public API addition, or behavioural change in this repo should be reflected in both **local documentation** (`docs/` files in the repo) and the **readme.io** hosted site.

The canonical English docs live in `docs/NESTJS-GUIDE.md`. The readme.io English site tracks it, and a **separate repo** (`git@github.com:PedroPCardoso/readme-docs.git`, branch `v1.0`) mirrors `docs/Getting Started/getting-started.md` — the same content must be kept in sync.

## Steps

### 1. Understand what changed

Read the diff or the PR to identify:

- New public methods or classes on the `MetricsBuilder` fluent API
- New options, modifiers (`forYear`, `fillMissingData`, `labelColumn`, etc.)
- New executor modes or repository helpers
- Changes to types, error classes, or the module registration API (`MetricsModule.forRoot`)
- Any behavioural change visible to a consumer

### 2. Map the change to the right doc

| Doc file | What it covers | Update when… |
|---|---|---|
| `docs/NESTJS-GUIDE.md` | Full NestJS usage — installation, module, MetricsService, aggregates, periods, windows, ranges, shorthands, fillMissingData, groupData, timezone, locale, cache, executor, filters, errors, helpers | Adding or changing anything in the NestJS adapter or the core fluent API |
| `docs/ARCHITECTURE.md` | Internal architecture — component layers, folder structure, design decisions, portability | Adding new internals, changing the engine, adding a new adapter (e.g. Prisma, Drizzle) |
| `docs/RELEASING.md` | Release workflow — two-branch model, how to publish | Changing the release process, CI/CD, or changeset configuration |

### 3. Update the chosen doc(s)

- **New fluent methods**: add a usage example after the existing ones, grouped by category (aggregate, period, modifier).
- **New options/parameters**: document the parameter, its type, default value, and behaviour.
- **New error classes**: add to the error hierarchy section with an example.
- **New adapters**: add a new section explaining the adapter and linking to its package.

Follow the existing doc style — code blocks with TypeScript, live examples, and short explanations.

### 4. Sync to the readme-docs repo

The `docs/NESTJS-GUIDE.md` content must be mirrored in `git@github.com:PedroPCardoso/readme-docs.git` at `docs/Getting Started/getting-started.md` on the `v1.0` branch.

```bash
# From the repo root
TMP=$(mktemp -d)
git clone git@github.com:PedroPCardoso/readme-docs.git "$TMP"
cd "$TMP"
git checkout v1.0

# Copy the updated content (strip the frontmatter if needed)
cp /full/path/to/jakarta/docs/NESTJS-GUIDE.md "$TMP/docs/Getting Started/getting-started.md"

git add -A
git commit -m "sync: update getting-started from jakarta docs"
git push origin v1.0
rm -rf "$TMP"
```

> **SSH access required.** Ensure your SSH key is added to the GitHub account that has push access to `readme-docs`.

### 5. Sync to readme.io (manual)

The readme.io site is updated outside of CI. After merging, create a note in the PR or an issue to sync the readme.io English docs to match the updated `docs/NESTJS-GUIDE.md`.

## Completion criteria

- Every new or changed public API item has a corresponding entry in the local docs.
- The codebase's `docs/` directory is committed with the feature.
- The `readme-docs` repo is updated with the same content.
- A sync flag (comment in PR or follow-up issue) is raised for readme.io if needed.
