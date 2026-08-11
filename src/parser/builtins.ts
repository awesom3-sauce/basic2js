// The builtin-function name/arity registry — the single source of truth
// the parser uses to decide whether `identifier(args)` is a builtin call
// (CallExpr) or an array reference (ArrayRef), and to validate argument
// counts at parse time. See DIALECT.md's "Builtin functions" table for the
// full semantics of each; this file only records name + arity.
//
// Keys are the lowercase `name + suffix` spelling `splitSuffix` produces
// (e.g. "left$", "len", "rnd") — the same format `varKey`/`CallExpr.callee`
// use elsewhere, so a plain Map.has/get works with no case-juggling at any
// call site.
//
// Locked scope decision (see DIALECT.md's Open Decisions): a builtin name
// is only reserved in *call position* — `identifier(` immediately followed
// by an open paren where `identifier` matches an entry here. A bare
// identifier with no following `(` (e.g. `LET LEN = 5`) is still parsed as
// an ordinary variable, unlike real BASIC's global reservation of these
// names. This keeps the change local to parsePrimary's existing
// ArrayRef-vs-CallExpr branch point instead of requiring a symbol-table
// pass everywhere an identifier can appear.
//
// src/emitter/runtime-calls.ts holds the matching name -> JS-emission
// mapping (owned separately since the parser doesn't need emission logic,
// only names/arity) — its unit test asserts the two tables' key sets are
// identical, so a new builtin can't be added to one and forgotten in the
// other.

export interface BuiltinArity {
  readonly min: number;
  readonly max: number;
}

export const BUILTIN_FUNCTIONS: ReadonlyMap<string, BuiltinArity> = new Map([
  // String (DIALECT.md's "String" builtin table).
  ["left$", { min: 2, max: 2 }],
  ["right$", { min: 2, max: 2 }],
  ["mid$", { min: 2, max: 3 }], // omitted 3rd arg (length) means "to end of string"
  ["len", { min: 1, max: 1 }],
  ["chr$", { min: 1, max: 1 }],
  ["asc", { min: 1, max: 1 }],
  ["str$", { min: 1, max: 1 }],
  ["val", { min: 1, max: 1 }],
  ["instr", { min: 2, max: 3 }], // 2 args: (haystack, needle); 3 args: (start, haystack, needle)

  // Math (DIALECT.md's "Math" builtin table).
  ["int", { min: 1, max: 1 }],
  ["abs", { min: 1, max: 1 }],
  ["sqr", { min: 1, max: 1 }],
  // Locked simplification: RND always takes exactly one argument and
  // always draws the next value from the seeded generator, ignoring the
  // argument's actual value — real GW-BASIC's n=0 ("repeat last value")
  // and n<0 ("reseed from n") special cases aren't supported. Use
  // RANDOMIZE to seed instead. See DIALECT.md's Open Decisions.
  ["rnd", { min: 1, max: 1 }],
  ["sgn", { min: 1, max: 1 }],
  ["sin", { min: 1, max: 1 }],
  ["cos", { min: 1, max: 1 }],
  ["tan", { min: 1, max: 1 }],
]);

export function lookupBuiltin(calleeKey: string): BuiltinArity | undefined {
  return BUILTIN_FUNCTIONS.get(calleeKey);
}
