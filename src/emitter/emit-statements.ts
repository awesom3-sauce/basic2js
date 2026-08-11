// Step -> JS `case N: { ... }` emission, one function per Step kind.
//
// Every case body is wrapped in its own block (`{ }`), even though a bare
// `case` doesn't strictly need one: some Step kinds (Print) declare local
// `let`/`const` bindings, and without an explicit block those are scoped
// to the WHOLE enclosing switch in JS, not just that case — which would
// collide across the many Print cases a real program emits (two `case`s
// both declaring `let __s` in the same switch is a SyntaxError without
// per-case blocks). Wrapping every case uniformly avoids depending on
// which kinds happen to need locals staying that way forever.
//
// Implemented: Print, Let, Goto, NoOp, Halt (build order step 4) and If
// (build order step 6) — exactly the Step kinds lowering currently
// produces (see src/ir/program.ts). INPUT (step 9) will be the only Step
// kind whose case body contains an `await` beyond the print calls emitted
// here (`rt.print` is always awaited too, for host symmetry — see
// src/runtime/interface.ts).

import type { Step } from "../ir/program.js";
import { emitExpression } from "./emit-expressions.js";
import { emitPrintCall } from "./emit-print.js";
import { emitJumpTarget } from "./emit-jump-target.js";
import { varKey } from "./mangle.js";
import { assertNever } from "../util/assert-never.js";

/**
 * Emits one `case <stepIndex>: { ... }` for `step`, which sits at index
 * `stepIndex` in the flat Step[] — so "fall through to the next step" is
 * always `pc = stepIndex + 1`.
 */
export function emitStep(step: Step, stepIndex: number): string {
  return `case ${stepIndex}: { __line = ${step.line}; ${emitStepBody(step, stepIndex)} }`;
}

function emitStepBody(step: Step, stepIndex: number): string {
  switch (step.kind) {
    case "Print":
      return `${emitPrintCall(step.segments)} pc = ${stepIndex + 1}; break;`;

    case "Let": {
      const target = `V[${JSON.stringify(varKey(step.target.name, step.target.suffix))}]`;
      return `${target} = ${emitExpression(step.value)}; pc = ${stepIndex + 1}; break;`;
    }

    case "Goto":
      return `pc = ${emitJumpTarget(step.target)}; break;`;

    case "If":
      return `pc = (${emitExpression(step.condition)}) ? (${emitJumpTarget(step.thenTarget)}) : (${emitJumpTarget(step.elseTarget)}); break;`;

    case "NoOp":
      return `pc = ${stepIndex + 1}; break;`;

    case "Halt":
      return "pc = -1; break;";

    default:
      return assertNever(step, "emitStepBody");
  }
}
