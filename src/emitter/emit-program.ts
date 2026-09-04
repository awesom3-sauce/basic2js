// Emitter orchestrator: LoweredProgram -> full JS source text.
//
// Produces a self-contained ES module: PRELUDE's support helpers,
// LINESTART/DATA_LINE_STARTS tables (BASIC line number -> step
// index/DATA-pool index, built straight from lineToStep/dataLineStarts),
// the DATA pool itself, and `export async function run(rt) { ... }` — the
// async dispatch-loop / virtual-PC trampoline described in CLAUDE.md.
// Emitted code only ever calls into the `rt` (BasicRuntime) parameter for
// I/O — never process.stdout/DOM/etc. directly — and has zero import
// dependencies of its own, so it can be written to a standalone .js file
// or loaded straight from a source string (see src/util/load-js-module.ts).
//
// The dispatch loop's top-level catch (build order step 16) wraps whatever
// was thrown in `__toBasicError(e, __line)` (a prelude.ts helper) before
// handing it to `rt.reportError` — this is what turns a bare `throw new
// Error("OVERFLOW: ...")` from deep inside some prelude helper into a
// proper `BasicRuntimeError` (message + code + the BASIC line number that
// was executing), matching `runtime/interface.ts`'s `reportError` contract.

import type { BasicValue } from "../ast/types.js";
import type { LineIndex, LoweredProgram } from "../ir/program.js";
import { DEFAULT_DIALECT, getDialectSpec, type Dialect } from "../dialect.js";
import { emitFnDefs } from "./emit-fn-defs.js";
import { emitStep } from "./emit-statements.js";
import { PRELUDE } from "./prelude.js";

export function emit(lowered: LoweredProgram, dialect: Dialect = DEFAULT_DIALECT): string {
  const builtinOverrides = getDialectSpec(dialect).builtinOverrides;
  const linestart = emitLineTable(lowered.lineToStep);
  const dataLineStarts = emitLineTable(lowered.dataLineStarts);
  const data = emitDataArray(lowered.data);
  const fnDefs = emitFnDefs(lowered.fnDefs, builtinOverrides);
  const cases = lowered.steps
    .map((step, index) => emitStep(step, index, builtinOverrides))
    .join("\n      ");

  return `${PRELUDE}

const LINESTART = ${linestart};
const DATA = ${data};
const DATA_LINE_STARTS = ${dataLineStarts};

export async function run(rt) {
  const V = {};
  const ARR = {};
  const FN = {};
  const forStack = [];
  const gosubStack = [];
  let pc = 0;
  let __line = 0;
  let dataPtr = 0;
  ${fnDefs}
  try {
    while (pc !== -1) {
      switch (pc) {
      ${cases}
        default:
          pc = -1;
      }
    }
  } catch (e) {
    await rt.reportError(__toBasicError(e, __line));
  }
}
`;
}

function emitLineTable(table: LineIndex): string {
  const entries = [...table.entries()].map(([line, value]) => `${line}: ${value}`);
  return `{ ${entries.join(", ")} }`;
}

function emitDataArray(data: readonly BasicValue[]): string {
  const items = data.map((value) =>
    typeof value === "string" ? JSON.stringify(value) : String(value),
  );
  return `[${items.join(", ")}]`;
}
