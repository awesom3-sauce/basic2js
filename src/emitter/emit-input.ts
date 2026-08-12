// INPUT emission: builds the JS statements that suspend for user input via
// `await rt.input(...)`, split the response on commas, and assign each
// (coerced) part to its target variable or array element (build order
// step 10).
//
// Known simplification (still not addressed by step 15's type-suffix
// work, and intentionally out of v1 scope — see DIALECT.md's Open
// Decisions): numeric coercion here is a bare `Number(...)` via the
// prelude's `__inputCoerce`, falling back to `0` on unparseable input,
// rather than real BASIC's "?Redo from start" re-prompt-on-invalid-input
// behavior. What step 15 *did* add: a "%"-suffixed target's parsed number
// now also gets `__toInt`'s round-half-away-from-zero + overflow check
// (via `__inputCoerce`'s new suffix parameter), the same as every other
// assignment site.

import type { InputStep } from "../ir/program.js";
import { emitExpression } from "./emit-expressions.js";
import { varKey } from "./mangle.js";

export function emitInputCall(step: InputStep, stepIndex: number): string {
  const promptText = JSON.stringify(computePromptText(step.prompt, step.appendQuestionMark));

  const assignments = step.targets
    .map((target, index) => {
      const key = JSON.stringify(varKey(target.name, target.suffix));
      const isString = target.suffix === "$";
      const value = `__inputCoerce(__parts[${index}] ?? "", ${JSON.stringify(target.suffix)})`;
      if (target.kind === "ArrayElement") {
        const indices = `[${target.indices.map((e) => emitExpression(e)).join(", ")}]`;
        return `__arrSet(ARR, ${key}, ${indices}, ${value}, ${isString});`;
      }
      return `V[${key}] = ${value};`;
    })
    .join(" ");

  return (
    `const __raw = await rt.input(${promptText}); ` +
    `const __parts = __raw.split(","); ` +
    `${assignments} ` +
    `pc = ${stepIndex + 1}; break;`
  );
}

/**
 * A prompt followed by `;` gets a trailing `? ` appended (GW-BASIC's
 * default); followed by `,` suppresses it. No prompt at all still shows a
 * bare `? `. See parseInputStmt (parse-statements.ts) and DIALECT.md.
 */
function computePromptText(prompt: string | undefined, appendQuestionMark: boolean): string {
  return (prompt ?? "") + (appendQuestionMark ? "? " : "");
}
