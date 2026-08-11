// Identifier -> safe runtime-object key encoding.
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
