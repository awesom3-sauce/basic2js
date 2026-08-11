// DEF FN registry emission: builds the JS statements that define every
// `DEF FN` in the program as a real JS function, keyed into a local `FN`
// object — see emit-program.ts, which declares `FN` and calls this right
// after V/ARR/etc. inside run()'s closure (not at module level like
// LINESTART/DATA, since a DEF FN body can read free variables from the
// caller's live V/ARR state, which only exists per-run() — see
// src/ir/program.ts's FnDef).
//
// Each function's own parameters become real JS function parameters
// (mangled to safe identifiers via mangleParamName), and the body is
// emitted with those parameter keys passed as `locals` to emitExpression
// — so a VariableRef matching a parameter name resolves to the JS
// parameter (shadowing, exactly like BASIC's own scoping) instead of a
// V[...] lookup, using JS's native function scoping to do that work for
// free rather than any bespoke mechanism.

import type { FnDef } from "../ir/program.js";
import { emitExpression } from "./emit-expressions.js";
import { mangleParamName, varKey } from "./mangle.js";

export function emitFnDefs(fnDefs: ReadonlyMap<string, FnDef>): string {
  return [...fnDefs.entries()].map(([key, def]) => emitOneFnDef(key, def)).join("\n  ");
}

function emitOneFnDef(key: string, def: FnDef): string {
  const paramKeys = def.params.map((p) => varKey(p.name, p.suffix));
  const jsParams = paramKeys.map(mangleParamName).join(", ");
  const locals = new Set(paramKeys);
  const body = emitExpression(def.body, locals);
  return `FN[${JSON.stringify(key)}] = function (${jsParams}) { return ${body}; };`;
}
