// Emitter orchestrator: LoweredProgram -> full JS source text.
//
// Produces a self-contained ES module: PRELUDE's support helpers, a
// LINESTART table (BASIC line number -> step index, built straight from
// lineToStep), and `export async function run(rt) { ... }` — the async
// dispatch-loop / virtual-PC trampoline described in CLAUDE.md. Emitted
// code only ever calls into the `rt` (BasicRuntime) parameter for I/O —
// never process.stdout/DOM/etc. directly — and has zero import
// dependencies of its own, so it can be written to a standalone .js file
// or loaded straight from a source string (see src/util/load-js-module.ts).

import type { LineIndex, LoweredProgram } from "../ir/program.js";
import { emitStep } from "./emit-statements.js";
import { PRELUDE } from "./prelude.js";

export function emit(lowered: LoweredProgram): string {
  const linestart = emitLineStartTable(lowered.lineToStep);
  const cases = lowered.steps.map((step, index) => emitStep(step, index)).join("\n      ");

  return `${PRELUDE}

const LINESTART = ${linestart};

export async function run(rt) {
  const V = {};
  const ARR = {};
  const forStack = [];
  let pc = 0;
  let __line = 0;
  try {
    while (pc !== -1) {
      switch (pc) {
      ${cases}
        default:
          pc = -1;
      }
    }
  } catch (e) {
    await rt.reportError(e);
  }
}
`;
}

function emitLineStartTable(lineToStep: LineIndex): string {
  const entries = [...lineToStep.entries()].map(([line, step]) => `${line}: ${step}`);
  return `{ ${entries.join(", ")} }`;
}
