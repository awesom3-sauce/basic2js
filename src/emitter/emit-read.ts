// READ emission: builds the JS statements that pull the next value(s) off
// the pre-collected DATA pool (see lowering.ts's collectData) and assign
// them to each target.
//
// Unlike INPUT (which always receives a raw string and coerces it), DATA
// values are already typed (number or string) from parsing — READ does a
// raw assignment with no type-suffix validation against the target, same
// as LET (deferred to step 15/16).

import type { ReadStep } from "../ir/program.js";
import { emitExpression } from "./emit-expressions.js";
import { varKey } from "./mangle.js";

export function emitReadCall(step: ReadStep, stepIndex: number): string {
  const assignments = step.targets
    .map((target) => {
      const key = JSON.stringify(varKey(target.name, target.suffix));
      // `dataPtr++` evaluates to the pre-increment value while advancing
      // the pointer as a side effect of evaluating this one argument — no
      // separate increment statement needed.
      const value = "__readNext(dataPtr++)";
      if (target.kind === "ArrayElement") {
        const indices = `[${target.indices.map(emitExpression).join(", ")}]`;
        const isString = target.suffix === "$";
        return `__arrSet(ARR, ${key}, ${indices}, ${value}, ${isString});`;
      }
      return `V[${key}] = ${value};`;
    })
    .join(" ");

  return `${assignments} pc = ${stepIndex + 1}; break;`;
}
