// Golden-file integration test harness. Auto-discovers every subdirectory
// under ./programs/ that actually has a program.bas (feature-specific
// placeholders that only have a README so far — see CONTRIBUTING.md — are
// silently skipped rather than failing), compiles + runs it against a
// scripted TestRuntime, and asserts the captured output matches
// expected.txt exactly.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compile } from "../../src/index.js";
import { importModuleFromSource } from "../../src/util/load-js-module.js";
import type { BasicRuntime } from "../../src/runtime/interface.js";
import { TestRuntime } from "../helpers/test-runtime.js";

const PROGRAMS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "programs");

const programNames = readdirSync(PROGRAMS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(path.join(PROGRAMS_DIR, name, "program.bas")))
  .sort();

describe.each(programNames)("golden: %s", (name) => {
  const dir = path.join(PROGRAMS_DIR, name);

  it("produces the expected output", async () => {
    const source = readFileSync(path.join(dir, "program.bas"), "utf-8");
    const expected = readFileSync(path.join(dir, "expected.txt"), "utf-8");
    const inputPath = path.join(dir, "input.txt");
    const scriptedInput = existsSync(inputPath)
      ? readFileSync(inputPath, "utf-8")
          .split("\n")
          .filter((line) => line.length > 0)
      : [];

    const { js } = compile(source);
    const mod = await importModuleFromSource(js);
    const run = mod.run as (rt: BasicRuntime) => Promise<void>;
    const rt = new TestRuntime(scriptedInput);
    await run(rt);

    expect(rt.output).toBe(expected);
  });
});
