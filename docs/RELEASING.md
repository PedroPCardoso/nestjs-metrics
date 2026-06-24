# Releasing

This package is published to npm with [Changesets](https://github.com/changesets/changesets).
Releases are **two-phase**: a normal push opens a release PR, and **merging that PR**
is what actually publishes. Nothing is published on a plain push to `master`.

## TL;DR

1. Make your change on `master` (or a feature branch merged to `master`).
2. Add a changeset describing the bump: `npx changeset` → commit the generated
   `.changeset/*.md` file.
3. Push to `master`. The **Release** workflow opens (or updates) a
   **"Version Packages"** PR from the `changeset-release/master` branch.
4. **Merge that PR.** This is the publish trigger — the workflow re-runs on the
   merge commit and runs `changeset publish`, pushing the new version to npm.

## The two branches, and what lives where

The fix code and the version bump live in **different places**. This trips people up.

| Where | Contains |
|-------|----------|
| `master` (your fix commit) | The actual code change **and** the `.changeset/*.md` describing it |
| `changeset-release/master` (the "Version Packages" PR) | **Only** the mechanical bump: deletes the consumed changeset, updates `CHANGELOG.md`, bumps `version` in `package.json` |

The release PR carries the *version stamp*, not the *fix*. When you merge it into
`master`, `master` ends up with **fix + bumped version**, and it's that state the
workflow publishes from. So the published tarball always includes the fix even
though the release branch's diff is just three files.

```
master ───────────── <fix commit> ───────────────────┐
                      (code + .changeset/*.md)         ├──► merge "Version Packages" PR
changeset-release/master ── "Version Packages" ────────┘
                            (delete changeset,                 │
                             CHANGELOG, version bump)          ▼
                                                  Release workflow re-runs on master,
                                                  runs `changeset publish` → npm
```

## How to tell what state you're in

```bash
# Is the release PR still open? (publish hasn't happened yet)
gh pr list --search "Version Packages in:title" --state open

# What version is actually live on npm?
npm view nestjs-metrics version

# What version will the release PR ship?
gh api repos/PedroPCardoso/nestjs-metrics/contents/package.json?ref=changeset-release/master \
  --jq '.content' | base64 -d | grep '"version"'
```

If npm shows the **old** version while the release PR is **open**, the fix is on
`master` but **not yet published** — merge the PR to ship it.

## Why a push doesn't publish

`.github/workflows/release.yml` runs `changesets/action@v1` on every push to
`master`. That action:

- if there are **unconsumed** changesets → opens/updates the "Version Packages" PR
  (consumes the changesets, bumps versions) — **does not publish**;
- if there are **no** unconsumed changesets (i.e. the PR was just merged) → runs
  `npm run release` (`changeset publish`) → **publishes to npm**.

So merging the release PR is the second push that flips the action from
"prepare" to "publish".

## Config

- `baseBranch: master` — `.changeset/config.json`
- `access: public`, npm provenance enabled — `package.json#publishConfig`
- Secrets used by the workflow: `NPM_TOKEN` (publish), `GITHUB_TOKEN` (open PR)
