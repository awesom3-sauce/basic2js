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
// Implemented: Print, Let, Goto, NoOp, Halt (build order step 4), If
// (build order step 6), For/Next (build order step 7), and
// Gosub/Return/OnJump (build order step 8) — exactly the Step kinds
// lowering currently produces (see src/ir/program.ts). INPUT (step 9)
// will be the only Step kind whose case body contains an `await` beyond
// the print calls emitted here (`rt.print` is always awaited too, for
// host symmetry — see src/runtime/interface.ts).

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

    case "For": {
      const key = JSON.stringify(varKey(step.variable, step.suffix));
      const stepExpr = step.step === undefined ? "1" : emitExpression(step.step);
      const bodyPc = stepIndex + 1;
      // start/end/step are all evaluated first, using whatever value the
      // loop variable held *before* this FOR (relevant if e.g. `end`
      // itself references the loop variable, as in `FOR I = 1 TO I * 2`)
      // — only once all three are computed does V[key] get reassigned.
      // (No extra `{ }` needed around these `const`s: emitStep already
      // wraps this whole case body in its own block.)
      return (
        `const __start = ${emitExpression(step.start)}; ` +
        `const __limit = ${emitExpression(step.end)}; ` +
        `const __step = ${stepExpr}; ` +
        `V[${key}] = __start; ` +
        `forStack.push({ key: ${key}, limit: __limit, step: __step, bodyPc: ${bodyPc} }); ` +
        `pc = ${bodyPc}; break;`
      );
    }

    case "Next": {
      const variable = step.variable === undefined ? "null" : JSON.stringify(step.variable);
      return `pc = __nextFor(V, forStack, ${variable}, ${stepIndex + 1}); break;`;
    }

    case "Gosub":
      return `gosubStack.push(${stepIndex + 1}); pc = ${emitJumpTarget(step.target)}; break;`;

    case "Return":
      return "pc = __return(gosubStack); break;";

    case "OnJump": {
      const targets = `[${step.targets.map(emitJumpTarget).join(", ")}]`;
      const fallthroughPc = stepIndex + 1;
      const selectTarget = `__onJumpTarget(${emitExpression(step.selector)}, ${targets})`;
      if (step.mode === "goto") {
        return `pc = ${selectTarget} ?? ${fallthroughPc}; break;`;
      }
      // ON...GOSUB: only push a return address if a target actually
      // matched — an out-of-range selector falls through without ever
      // "calling" anywhere, so nothing should be pushed for it either.
      return (
        `const __target = ${selectTarget}; ` +
        `if (__target === null) { pc = ${fallthroughPc}; } ` +
        `else { gosubStack.push(${fallthroughPc}); pc = __target; } ` +
        `break;`
      );
    }

    case "NoOp":
      return `pc = ${stepIndex + 1}; break;`;

    case "Halt":
      return "pc = -1; break;";

    default:
      return assertNever(step, "emitStepBody");
  }
}
