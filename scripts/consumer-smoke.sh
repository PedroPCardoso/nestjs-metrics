#!/usr/bin/env bash
# Build, pack, and verify the tarball works in a fresh CommonJS consumer.
set -euo pipefail

ROOT="$(pwd)"
npm run build

TARBALL="$ROOT/$(npm pack --silent)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP" "$TARBALL"' EXIT

cp "$ROOT/scripts/consumer-smoke.cjs" "$TMP/smoke.cjs"
cd "$TMP"
npm init -y >/dev/null 2>&1
npm install --no-audit --no-fund \
  "$TARBALL" typeorm better-sqlite3 reflect-metadata @nestjs/common @nestjs/core >/dev/null 2>&1

node smoke.cjs
