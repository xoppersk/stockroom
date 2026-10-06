#!/usr/bin/env node
/**
 * bundle-gate.mjs — per-route JavaScript bundle-size gate.
 *
 * Reads the per-page client-reference manifests Next.js writes during
 * `next build` (under .next/server/app, one page_client-reference-manifest.js
 * per route), sums the unique client chunks each route loads, and fails when
 * any route exceeds its budget. Keeps client JS honest as the app grows.
 *
 * Configuration:
 *   BUNDLE_BUDGET_KB   per-route budget in KB (default: 500)
 *
 * Usage: run AFTER `next build`:
 *   pnpm build && pnpm bundle:gate
 */
import { readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const ROOT = resolve(process.cwd(), ".next");
const SERVER_APP = join(ROOT, "server", "app");
const BUDGET_KB = Number.parseInt(process.env.BUNDLE_BUDGET_KB ?? "500", 10);
const BUDGET_BYTES = BUDGET_KB * 1024;
const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`\n❌ bundle gate failed: ${message}`);
  process.exit(1);
}

/** Recursively find every page_client-reference-manifest.js under .next/server/app. */
function findManifests(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) findManifests(full, out);
    else if (entry.name === "page_client-reference-manifest.js") out.push(full);
  }
  return out;
}

/**
 * "/(app)/app/account/page" → "/app/account". Strips route groups and the
 * trailing /page segment; the root page key "page" becomes "/".
 */
function manifestKeyToRoute(key) {
  const stripped = key
    .split("/")
    .filter((seg) => seg && !seg.startsWith("(") && seg !== "page")
    .join("/");
  return `/${stripped}`;
}

const manifestFiles = findManifests(SERVER_APP);
if (manifestFiles.length === 0) {
  fail("no client-reference manifests found — run `next build` first.");
}

const rows = [];
for (const file of manifestFiles) {
  // Each manifest assigns into globalThis.__RSC_MANIFEST — isolate per file.
  globalThis.__RSC_MANIFEST = {};
  require(file);
  const entries = Object.entries(globalThis.__RSC_MANIFEST);
  if (entries.length === 0) continue;

  const chunks = new Set();
  for (const [, manifest] of entries) {
    for (const mod of Object.values(manifest.clientModules ?? {})) {
      for (const chunk of mod.chunks ?? []) {
        if (chunk.endsWith(".js")) chunks.add(chunk.replace(/^\/_next\//, ""));
      }
    }
  }

  let bytes = 0;
  for (const chunk of chunks) {
    try {
      bytes += statSync(join(ROOT, chunk)).size;
    } catch {
      // Chunk listed but not on disk — ignore.
    }
  }
  rows.push({ route: manifestKeyToRoute(entries[0][0]), kb: bytes / 1024 });
}

if (rows.length === 0) {
  fail("no routes found in client-reference manifests — nothing to gate.");
}

rows.sort((a, b) => b.kb - a.kb);

const widest = Math.max(...rows.map((r) => r.route.length));
console.log(`\nRoute JS budget: ${BUDGET_KB} KB per route\n`);
for (const { route, kb } of rows) {
  const status = kb <= BUDGET_KB ? "✓" : "✗ OVER";
  console.log(`  ${status}  ${route.padEnd(widest)}  ${kb.toFixed(1).padStart(8)} KB`);
}

const offenders = rows.filter((r) => r.kb > BUDGET_BYTES / 1024);
if (offenders.length > 0) {
  fail(
    `${offenders.length} route(s) exceed the ${BUDGET_KB} KB budget: ` +
      offenders.map((o) => `${o.route} (${o.kb.toFixed(1)} KB)`).join(", ") +
      ". Shrink client JS (dynamic imports, smaller deps) or raise BUNDLE_BUDGET_KB deliberately.",
  );
}

console.log(`\n✅ bundle gate passed — all ${rows.length} routes within ${BUDGET_KB} KB.\n`);
