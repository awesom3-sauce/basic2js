// String builtin implementations: LEFT$, RIGHT$, MID$, LEN, CHR$, ASC,
// STR$, VAL, INSTR.
//
// Scope note (build order step 14): these ended up implemented directly as
// plain JS in src/emitter/prelude.ts (__left/__right/__mid/__chr/__asc/
// __str/__val/__instr), not here. They're pure and stateless — nothing
// outside emitted code ever needs to call LEFT$/MID$/etc. — so there's no
// real "runtime host" concern for this file to own (contrast
// src/runtime/shared/random.ts, whose RND/RANDOMIZE genuinely need the
// BasicRuntime host for entropy, and _is_ used by NodeRuntime/TestRuntime
// directly). A second TS copy of this logic here, unused by anything, would
// only be a duplication/drift risk against prelude.ts's real implementation
// with no payoff — so this file is intentionally left as a stub rather than
// growing a parallel implementation. See prelude.ts's header comment and
// DIALECT.md's builtin function table for the actual behavior/edge cases
// (MID$ with omitted length, INSTR-not-found returning 0, VAL on malformed
// input, ASC on empty string, ...), and emit-program.test.ts's "emit —
// builtins" tests for their behavioral coverage.

export {};
