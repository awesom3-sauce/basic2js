// INPUT emission: builds the JS statements that suspend for user input via
// `await rt.input(...)`, split the response on commas, and assign each
// (coerced) part to its target variable.
//
// Known simplification (deferred to build order step 15's full
// type-suffix enforcement): numeric coercion here is a bare `Number(...)`
// via the prelude's `__inputCoerce`, falling back to `0` on unparseable
// input, rather than real BASIC's "?Redo from start" re-prompt-on-invalid-
// input behavior.

import type { InputStep } from "../ir/program.js";
import { varKey } from "./mangle.js";

export function emitInputCall(step: InputStep, stepIndex: number): string {
  const promptText = JSON.stringify(computePromptText(step.prompt, step.appendQuestionMark));

  const assignments = step.targets
    .map((target, index) => {
      if (target.kind !== "Variable") {
        throw new Error(
          "Internal error: emitting INPUT into an array element is not implemented yet (build order step 10)",
        );
      }
      const key = JSON.stringify(varKey(target.name, target.suffix));
      const isString = target.suffix === "$";
      return `V[${key}] = __inputCoerce(__parts[${index}] ?? "", ${isString});`;
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
