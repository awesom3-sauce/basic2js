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
// (build order step 6), For/Next (build order step 7),
// Gosub/Return/OnJump (build order step 8), Input (build order step 9),
// Dim (build order step 10), Read/Restore (build order step 11),
// While/Wend (build order step 12), Randomize (build order step 14), and
// Open/Close (GW-BASIC dialect extension — see src/dialect.ts) — exactly
// the Step kinds lowering currently produces (see src/ir/program.ts).
// Input/Open/Close all `await` a real host (`rt`) call (`rt.print` is
// always awaited too, for host symmetry — see src/runtime/interface.ts);
// Randomize calls `rt.seedRandom` synchronously.

import type { Step } from "../ir/program.js";
import { coerceForSuffix } from "./coerce.js";
import { emitExpression } from "./emit-expressions.js";
import { emitPrintCall } from "./emit-print.js";
import { emitInputCall } from "./emit-input.js";
import { emitReadCall } from "./emit-read.js";
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
      return `${emitPrintCall(step.segments, step.fileNumber)} pc = ${stepIndex + 1}; break;`;

    case "Let": {
      const key = JSON.stringify(varKey(step.target.name, step.target.suffix));
      // Type-suffix coercion (build order step 15) happens here, at the
      // assignment site, not on `step.value` itself — matching DIALECT.md's
      // "enforced at assignment time, not on every intermediate expression".
      const value = coerceForSuffix(step.target.suffix, emitExpression(step.value));
      if (step.target.kind === "ArrayElement") {
        const indices = `[${step.target.indices.map((e) => emitExpression(e)).join(", ")}]`;
        const isString = step.target.suffix === "$";
        return `__arrSet(ARR, ${key}, ${indices}, ${value}, ${isString}); pc = ${stepIndex + 1}; break;`;
      }
      return `V[${key}] = ${value}; pc = ${stepIndex + 1}; break;`;
    }

    case "Goto":
      return `pc = ${emitJumpTarget(step.target)}; break;`;

    case "If":
      return `pc = (${emitExpression(step.condition)}) ? (${emitJumpTarget(step.thenTarget)}) : (${emitJumpTarget(step.elseTarget)}); break;`;

    case "For": {
      const key = JSON.stringify(varKey(step.variable, step.suffix));
      const stepExpr = step.step === undefined ? "1" : emitExpression(step.step);
      const bodyPc = stepIndex + 1;
      const isInt = step.suffix === "%";
      // start/end/step are all evaluated first, using whatever value the
      // loop variable held *before* this FOR (relevant if e.g. `end`
      // itself references the loop variable, as in `FOR I = 1 TO I * 2`)
      // — only once all three are computed does V[key] get reassigned.
      // (No extra `{ }` needed around these `const`s: emitStep already
      // wraps this whole case body in its own block.) `isInt` (build order
      // step 15) travels with the forStack frame so __nextFor's per-
      // iteration increment can re-round/overflow-check a "%"-suffixed
      // loop variable the same way this initial assignment does — a
      // string-suffixed loop variable is rejected at compile time instead
      // (see semantics/analyzer.ts), so only "%" needs handling here.
      return (
        `const __start = ${emitExpression(step.start)}; ` +
        `const __limit = ${emitExpression(step.end)}; ` +
        `const __step = ${stepExpr}; ` +
        `V[${key}] = ${coerceForSuffix(step.suffix, "__start")}; ` +
        `forStack.push({ key: ${key}, limit: __limit, step: __step, bodyPc: ${bodyPc}, isInt: ${isInt} }); ` +
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

    case "Input":
      return emitInputCall(step, stepIndex);

    case "Dim": {
      const allocations = step.declarations
        .map((decl) => {
          const key = JSON.stringify(varKey(decl.name, decl.suffix));
          const dims = `[${decl.dimensions.map((e) => emitExpression(e)).join(", ")}]`;
          const isString = decl.suffix === "$";
          return `ARR[${key}] = __arrAlloc(${dims}, ${isString});`;
        })
        .join(" ");
      return `${allocations} pc = ${stepIndex + 1}; break;`;
    }

    case "Read":
      return emitReadCall(step, stepIndex);

    case "Restore": {
      const target = step.target === undefined ? "null" : String(step.target);
      return `dataPtr = __restoreTarget(${target}); pc = ${stepIndex + 1}; break;`;
    }

    case "While":
      return `pc = (${emitExpression(step.condition)}) ? ${stepIndex + 1} : (${emitJumpTarget(step.afterWend)}); break;`;

    case "Wend":
      return `pc = ${emitJumpTarget(step.whileTarget)}; break;`;

    case "Randomize":
      // rt.seedRandom is synchronous (see runtime/interface.ts) — no await needed.
      return `rt.seedRandom(${emitExpression(step.seed)}); pc = ${stepIndex + 1}; break;`;

    case "Open": {
      // GW-BASIC dialect extension (see src/dialect.ts) — real file I/O
      // always goes through the host (rt), same reasoning as INPUT/RND:
      // emitted code itself has no filesystem access of its own.
      const path = emitExpression(step.path);
      const fileNumber = emitExpression(step.fileNumber);
      return `await rt.openFile(${fileNumber}, ${path}, ${JSON.stringify(step.mode)}); pc = ${stepIndex + 1}; break;`;
    }

    case "Close": {
      if (step.fileNumbers.length === 0) {
        return `await rt.closeAllFiles(); pc = ${stepIndex + 1}; break;`;
      }
      const closes = step.fileNumbers
        .map((fileNumber) => `await rt.closeFile(${emitExpression(fileNumber)});`)
        .join(" ");
      return `${closes} pc = ${stepIndex + 1}; break;`;
    }

    case "NoOp":
      return `pc = ${stepIndex + 1}; break;`;

    case "Halt":
      return "pc = -1; break;";

    default:
      return assertNever(step, "emitStepBody");
  }
}
