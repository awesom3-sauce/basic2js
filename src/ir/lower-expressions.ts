// Lowering helpers for expressions embedded within steps — turned out
// unnecessary. Expressions need no lowering-stage rewriting at all: every
// Statement's Expression fields pass straight through from AST into a
// Step unchanged (lower-statements.ts), and the emitter (emit-expressions.ts)
// turns them into JS directly from there. This held even once DEF FN
// (build order step 13) landed — a `FN name(...)` call also needed no
// expression-level rewriting, since it's resolved entirely at emission
// time (checking the callee against the builtin registry, then falling
// back to `FN[key](...)` — see emit-expressions.ts and
// src/emitter/emit-fn-defs.ts's `FnDef` registry), not by transforming the
// AST. Left as a stub rather than deleted, matching this project's
// convention for a module whose originally-anticipated need never
// materialized (see e.g. runtime/shared/strings.ts, math.ts, values.ts).

export {};
