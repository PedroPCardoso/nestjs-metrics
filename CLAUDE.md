# CLAUDE.md

Guidance for working in this repo.

## What this is

`nestjs-metrics` — a TypeScript/NestJS port of `eliseekn/laravel-metrics`: a fluent
builder for generating metrics and trends from TypeORM entities. CJS package with two
entry points exposed via the `exports` map:

- `nestjs-metrics` — core builder/service
- `nestjs-metrics/nestjs` — the NestJS module (`MetricsModule.forRoot(...)`)

## Subpath resolution gotcha

The `nestjs-metrics/nestjs` subpath must resolve under **both** modern resolvers
(`node16`/`nodenext`/`bundler`, which read `exports`) **and** classic
`moduleResolution: "node"` (node10, which ignores `exports`). To make classic
resolution work we ship a physical **`nestjs/package.json` stub** pointing at
`../dist/nestjs/...` (the `rxjs/operators` pattern). Don't delete it, and keep
`"nestjs"` in `package.json#files` so it gets published.

## Releasing

Releases use **Changesets** and are **two-phase**: pushing to `master` only opens a
"Version Packages" PR; **merging that PR is what publishes to npm**. The fix code
lives on `master`; the release PR (`changeset-release/master`) carries only the
version bump. See **[docs/RELEASING.md](docs/RELEASING.md)** for the full flow,
the two-branch model, and how to check whether a version is actually live on npm.

Quick checks:

```bash
npm view nestjs-metrics version                                   # what's live on npm
gh pr list --search "Version Packages in:title" --state open      # is a release pending?
```

## Development — use Docker

All dev commands (install, test, build, lint, typecheck) run **inside Docker**, not on
the host. Don't run `npm install`/`npm test`/etc. directly on the host.

Scripts (run them in the container): `build` (tsup), `test` (vitest), `typecheck`
(`tsc --noEmit`), `lint` (eslint), `smoke` (`scripts/consumer-smoke.sh`).

## Architecture

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the builder internals.

API quick reference:

- `count()` / `sum()` → `.metrics()` returns a number.
- `sumByMonth()` / `countByMonth()` / `sumByYear()` → `.trends()` returns `{labels, data}`.
- `forYear()`, `fillMissingData()`, `labelColumn()` are modifiers.
- The `count` arg to the period shorthands: `0` = whole period (no window),
  `1` = single unit, `>1` = last-n window.
- `labelColumn('status')` replaces the period bucket with categorical grouping, **but
  the period WHERE filter still applies**. To group by a column scoped to a year, use
  `sumByYear('amount', 1).forYear(YYYY).labelColumn('status')` rather than mixing a
  month window with `labelColumn`.
