// Builtin-function name -> JS-emission mapping, used by emit-expressions.ts
// to turn a CallExpr the parser already resolved as a builtin call (see
// builtins.ts) into JS source text. Each entry receives the already-emitted
// JS text for each argument (not the AST Expression nodes themselves —
// emit-expressions.ts has already recursed into them, threading `locals`
// through, before looking the callee up here) and returns the full call
// expression's JS text.
//
// Most entries delegate to a `__`-prefixed prelude.ts helper (see its
// header comment for why the actual logic lives there, not in a
// src/runtime/shared/*.ts TS mirror); a few (INT/ABS/SIN/COS/TAN) are
// simple enough to emit a bare `Math.*` call directly with no helper
// indirection. RND is the one entry that reaches outside pure JS into the
// `rt` (BasicRuntime) host parameter — see runtime/interface.ts's
// `random()` — since real entropy has to come from the host, not from
// emitted code itself; its argument is intentionally unused (see
// builtins.ts's doc comment on RND's arity entry for the locked
// simplification this represents).
//
// This file's key set must exactly match builtins.ts's BUILTIN_FUNCTIONS —
// see runtime-calls.test.ts, which asserts that directly so the two tables
// can never silently drift apart.

import { BUILTIN_FUNCTIONS } from "../parser/builtins.js";

type EmitCall = (args: readonly string[]) => string;

export const RUNTIME_CALLS: ReadonlyMap<string, EmitCall> = new Map<string, EmitCall>([
  // String builtins.
  ["left$", (a) => `__left(${a[0]}, ${a[1]})`],
  ["right$", (a) => `__right(${a[0]}, ${a[1]})`],
  ["mid$", (a) => `__mid(${a[0]}, ${a[1]}, ${a[2] ?? "undefined"})`],
  ["len", (a) => `${a[0]}.length`],
  ["chr$", (a) => `__chr(${a[0]})`],
  ["asc", (a) => `__asc(${a[0]})`],
  ["str$", (a) => `__str(${a[0]})`],
  ["val", (a) => `__val(${a[0]})`],
  // INSTR: 2 args means (haystack, needle) with an implicit start of 1;
  // 3 args means (start, haystack, needle) — see builtins.ts.
  [
    "instr",
    (a) => (a.length === 3 ? `__instr(${a[0]}, ${a[1]}, ${a[2]})` : `__instr(1, ${a[0]}, ${a[1]})`),
  ],

  // Math builtins.
  ["int", (a) => `Math.floor(${a[0]})`],
  ["abs", (a) => `Math.abs(${a[0]})`],
  ["sqr", (a) => `__sqr(${a[0]})`],
  ["rnd", () => "rt.random()"],
  ["sgn", (a) => `__sgn(${a[0]})`],
  ["sin", (a) => `Math.sin(${a[0]})`],
  ["cos", (a) => `Math.cos(${a[0]})`],
  ["tan", (a) => `Math.tan(${a[0]})`],

  // GW-BASIC dialect extension (file I/O — see src/dialect.ts). Like RND,
  // this reaches outside pure JS into the host: `isFileEof` is
  // synchronous (unlike the other file I/O runtime methods), so it can be
  // called directly from expression position with no `await` — see
  // runtime/interface.ts's doc comment on why. The `? -1 : 0` wrapping is
  // NOT optional here — real bug found via direct testing, not caught by
  // reasoning about it in advance: `isFileEof` returns a genuine JS
  // boolean, and BASIC's NOT/AND/OR compile to JS's bitwise ~/&/|, which
  // only round-trip correctly against BASIC's own -1/0 truthiness
  // convention. `~true` is `-2`, not `-1` — so an unwrapped `NOT EOF(1)`
  // stayed truthy (`-2`) even once EOF *was* true, since only exactly `0`
  // is falsy in JS, and a `WHILE NOT EOF(1)` loop using it would always
  // attempt one read too many before ever exiting. See DIALECT.md.
  ["eof", (a) => `(rt.isFileEof(${a[0]}) ? -1 : 0)`],
]);

// Dev-time self-check, exercised by runtime-calls.test.ts: every
// BUILTIN_FUNCTIONS key must have a RUNTIME_CALLS entry, and vice versa.
export function builtinKeysMatch(): boolean {
  const builtinKeys = new Set(BUILTIN_FUNCTIONS.keys());
  const runtimeKeys = new Set(RUNTIME_CALLS.keys());
  if (builtinKeys.size !== runtimeKeys.size) return false;
  for (const key of builtinKeys) if (!runtimeKeys.has(key)) return false;
  return true;
}
