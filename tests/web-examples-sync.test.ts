// Asserts web/src/examples/*.bas stays byte-for-byte identical to its
// tests/golden/programs/<name>/program.bas counterpart — see
// web/src/examples/README.md. Catches the two ever silently drifting apart
// (e.g. a golden program's source gets tweaked but the web copy doesn't,
// or vice versa) without needing Vite's `?raw` loader here (this test
// reads both sides directly via node:fs instead of importing
// web/src/examples/index.ts, which only resolves under Vite's transform
// pipeline, not plain Node/Vitest).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN_DIR = path.join(REPO_ROOT, "tests/golden/programs");
const EXAMPLES_DIR = path.join(REPO_ROOT, "web/src/examples");

const goldenNames = readdirSync(GOLDEN_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(path.join(GOLDEN_DIR, name, "program.bas")))
  .sort();

const exampleNames = readdirSync(EXAMPLES_DIR)
  .filter((name) => name.endsWith(".bas"))
  .map((name) => name.slice(0, -".bas".length))
  .sort();

describe("web/src/examples <-> tests/golden/programs sync", () => {
  it("bundles exactly the same set of programs as the golden test suite", () => {
    expect(exampleNames).toEqual(goldenNames);
  });

  it.each(goldenNames)("%s.bas matches its golden program.bas byte-for-byte", (name) => {
    const golden = readFileSync(path.join(GOLDEN_DIR, name, "program.bas"), "utf-8");
    const example = readFileSync(path.join(EXAMPLES_DIR, `${name}.bas`), "utf-8");
    expect(example).toBe(golden);
  });
});
