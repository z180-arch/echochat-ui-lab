/**
 * Static import-boundary checks. If an agent reintroduces a forbidden
 * edge, this suite fails without needing a browser.
 */
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function walkJs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkJs(full, acc);
    else if (entry.name.endsWith(".js")) acc.push(full);
  }
  return acc;
}

function rel(file) {
  return relative(ROOT, file).replaceAll("\\", "/");
}

function importsInfra(content) {
  return /from\s+["'][^"']*infrastructure\//.test(content) || /import\s*\(\s*["'][^"']*infrastructure\//.test(content);
}

function importsUi(content) {
  return /from\s+["'][^"']*\/ui\//.test(content) || /import\s*\(\s*["'][^"']*\/ui\//.test(content);
}

function importsDomain(content) {
  return /from\s+["'][^"']*\/domain\//.test(content) || /import\s*\(\s*["'][^"']*\/domain\//.test(content);
}

function importsDbImpl(content) {
  return (
    /infrastructure\/(dexie-db|dexie-adapter|idb|vendor\/dexie)/.test(content) ||
    /from\s+["'][^"']*\/idb\.js["']/.test(content)
  );
}

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    failures.push({ name, error: e.message });
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

console.log("\n=== Architecture boundaries ===\n");

test("domain does not import infrastructure", () => {
  for (const file of walkJs(join(ROOT, "src/domain"))) {
    const content = readFileSync(file, "utf-8");
    assert.ok(!importsInfra(content), `${rel(file)} must not import infrastructure`);
  }
});

test("domain does not import ui", () => {
  for (const file of walkJs(join(ROOT, "src/domain"))) {
    const content = readFileSync(file, "utf-8");
    assert.ok(!importsUi(content), `${rel(file)} must not import ui`);
  }
});

test("ui does not import Dexie / infrastructure / idb", () => {
  for (const file of walkJs(join(ROOT, "src/ui"))) {
    const content = readFileSync(file, "utf-8");
    assert.ok(!importsDbImpl(content) && !importsInfra(content), `${rel(file)} must not import database implementation`);
  }
});

test("main.js does not import infrastructure", () => {
  const content = readFileSync(join(ROOT, "src/main.js"), "utf-8");
  assert.ok(!importsInfra(content), "src/main.js must not import infrastructure");
});

test("repository does not import domain", () => {
  for (const file of walkJs(join(ROOT, "src/repository"))) {
    const content = readFileSync(file, "utf-8");
    assert.ok(!importsDomain(content), `${rel(file)} must not import domain`);
  }
});

test("provider does not import ui", () => {
  const content = readFileSync(join(ROOT, "src/domain/provider.js"), "utf-8");
  const err = readFileSync(join(ROOT, "src/domain/provider-error.js"), "utf-8");
  assert.ok(!importsUi(content), "provider.js must not import ui");
  assert.ok(!importsUi(err), "provider-error.js must not import ui");
});

console.log(`\nArchitecture boundary: ${passed} passed, ${failed} failed`);
if (failed) {
  failures.forEach((f) => console.log(`  - ${f.name}: ${f.error}`));
  process.exit(1);
}
