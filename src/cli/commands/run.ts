// `basic2js run <input.bas>` — the primary "just execute it" path. Compiles
// in-memory (no disk write for the generated JS) and executes it directly
// against a NodeRuntime.
//
// `--emit-ast`/`--emit-steps` (build order step 19) print an intermediate
// compiler artifact as JSON instead of executing, for debugging the
// compiler itself. Both deliberately bypass compile()'s semantic-analysis
// throw (calling tokenize/parse/lower directly instead of compile()) —
// dumping the AST/Step[] is often exactly what you want *when* a program
// has a type-suffix or undefined-line-target error, to see why, so a
// SemanticError shouldn't block either flag the way it blocks a normal run.
// This is a case where the CLI legitimately reaches past compile() into
// the compiler core's individual stages — allowed for the CLI (unlike
// web/src/engine, which is contractually restricted to compile() +
// BrowserRuntime only — see CLAUDE.md's UI replaceability contract).

import { readFile } from "node:fs/promises";
import { compile } from "../../index.js";
import { tokenize } from "../../lexer/lexer.js";
import { parse } from "../../parser/parser.js";
import { lower } from "../../ir/lowering.js";
import { importModuleFromSource } from "../../util/load-js-module.js";
import { NodeRuntime } from "../../runtime/node/node-runtime.js";

export interface RunCommandOptions {
  readonly emitAst?: boolean;
  readonly emitSteps?: boolean;
}

export async function runCommand(filePath: string, options: RunCommandOptions = {}): Promise<void> {
  const source = await readFile(filePath, "utf-8");

  if (options.emitAst) {
    process.stdout.write(stringifyDebugJson(parse(tokenize(source))));
    return;
  }

  if (options.emitSteps) {
    process.stdout.write(stringifyDebugJson(lower(parse(tokenize(source)))));
    return;
  }

  const { js } = compile(source);
  const mod = await importModuleFromSource(js);
  const run = mod.run as (rt: NodeRuntime) => Promise<void>;

  const rt = new NodeRuntime();
  try {
    await run(rt);
    // A BASIC runtime error (OVERFLOW, DIVISION BY ZERO, ...) is reported
    // via rt.reportError and then the dispatch loop simply stops — it
    // never makes `run(rt)` itself reject (see emit-program.ts's top-level
    // catch), so this is the only way the CLI can tell such a run apart
    // from one that completed cleanly and exit non-zero accordingly.
    if (rt.hadError) process.exitCode = 1;
  } finally {
    rt.close();
  }
}

/** JSON.stringify with Map fields (LoweredProgram's lineToStep/dataLineStarts/fnDefs) flattened to plain objects, since JSON.stringify silently renders a bare Map as "{}" otherwise. */
function stringifyDebugJson(value: unknown): string {
  return (
    JSON.stringify(value, (_key, v: unknown) => (v instanceof Map ? Object.fromEntries(v) : v), 2) +
    "\n"
  );
}
