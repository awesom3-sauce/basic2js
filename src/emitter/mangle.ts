// Identifier -> safe runtime-object key/identifier encoding.
//
// BASIC variables/arrays are stored as string-keyed entries in the emitted
// code's local V (scalars) / ARR (arrays, step 10) objects, never as bare
// JS identifiers — this sidesteps reserved-word collisions entirely
// (V["class"] is always legal even though `class` is a JS keyword).

import type { TypeSuffix } from "../ast/types.js";

/** `name` is already lowercased by the lexer/parser; the suffix is appended verbatim. */
export function varKey(name: string, suffix: TypeSuffix): string {
  return name + suffix;
}

/**
 * A `varKey` -> safe bare JS identifier encoding, used only for `DEF FN`
 * parameters (build order step 13): inside a function body, a parameter
 * shadows any same-named global variable, and doing that shadowing via a
 * real JS function parameter (rather than a V/ARR lookup) is what makes it
 * work for free using JS's own scoping — see emit-expressions.ts's
 * `locals` threading. Unlike `varKey`, this MUST be a valid bare JS
 * identifier (it's used as an actual parameter name, not a string key), so
 * %/!/#/$ can't be passed through verbatim; the `__p_` prefix keeps it
 * safely out of the way of both JS reserved words and (since BASIC
 * variables never become bare JS identifiers in the first place, only
 * V/ARR string keys) any possible BASIC-sourced name.
 */
export function mangleParamName(key: string): string {
  return (
    "__p_" +
    key.replace(/%/g, "_pct").replace(/!/g, "_sng").replace(/#/g, "_dbl").replace(/\$/g, "_str")
  );
}
