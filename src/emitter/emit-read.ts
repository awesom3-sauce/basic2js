// READ emission: builds the JS statements that pull the next value(s) off
// the pre-collected DATA pool (see lowering.ts's collectData) and assign
// them to each target.
//
// Unlike INPUT (which always receives a raw string and coerces it), DATA
// values are already typed (number or string) from parsing. READ still
// applies the same runtime %/$-suffix coercion every other assignment site
// does (build order step 15, via coerce.ts — round+overflow-check for "%",
// type-check for "$"), but gets no *compile-time* type-mismatch check the
// way LET does (see semantics/analyzer.ts's header comment): which DATA
// pool value lands in a given READ can depend on runtime RESTORE/control
// flow, not just source order, so a general compile-time correlation
// between a READ target's suffix and the DATA value it'll actually receive
// isn't feasible.

import type { ReadStep } from "../ir/program.js";
import { coerceForSuffix } from "./coerce.js";
import { emitExpression } from "./emit-expressions.js";
import { varKey } from "./mangle.js";

export function emitReadCall(step: ReadStep, stepIndex: number): string {
  const assignments = step.targets
    .map((target) => {
      const key = JSON.stringify(varKey(target.name, target.suffix));
      // `dataPtr++` evaluates to the pre-increment value while advancing
      // the pointer as a side effect of evaluating this one argument — no
      // separate increment statement needed.
      const value = coerceForSuffix(target.suffix, "__readNext(dataPtr++)");
      if (target.kind === "ArrayElement") {
        const indices = `[${target.indices.map((e) => emitExpression(e)).join(", ")}]`;
        const isString = target.suffix === "$";
        return `__arrSet(ARR, ${key}, ${indices}, ${value}, ${isString});`;
      }
      return `V[${key}] = ${value};`;
    })
    .join(" ");

  return `${assignments} pc = ${stepIndex + 1}; break;`;
}
