// `basic2js run <input.bas>` — the primary "just execute it" path. Compiles
// in-memory (no disk write for the generated JS) and executes it directly
// against a NodeRuntime.
//
// TODO (build order step 19): --emit-ast / --emit-steps debug flags to
// dump intermediate compiler output instead of executing.

import { readFile } from "node:fs/promises";
import { compile } from "../../index.js";
import { importModuleFromSource } from "../../util/load-js-module.js";
import { NodeRuntime } from "../../runtime/node/node-runtime.js";

export async function runCommand(filePath: string): Promise<void> {
  const source = await readFile(filePath, "utf-8");
  const { js } = compile(source);
  const mod = await importModuleFromSource(js);
  const run = mod.run as (rt: NodeRuntime) => Promise<void>;

  const rt = new NodeRuntime();
  try {
    await run(rt);
  } finally {
    rt.close();
  }
}
