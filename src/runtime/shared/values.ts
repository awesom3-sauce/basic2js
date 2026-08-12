// Type-suffix coercion helpers, applied at assignment time (LET, FOR-loop
// variable update, READ, INPUT, array-element store) — not to every
// intermediate expression. See DIALECT.md for the %/!/#/$ semantics table.
//
// Scope note (build order step 15): same decision as strings.ts/math.ts
// (see their header comments) — this ended up implemented directly as
// plain JS in src/emitter/prelude.ts (`__toInt`/`__toStr`), not here.
// Coercion is pure and stateless and only ever needed by emitted code (at
// the five assignment sites above), so there's no real "runtime host"
// concern for this file to own, and a second TS copy would just be a
// duplication/drift risk with no payoff. `!`/`#`/no-suffix targets need no
// helper at all — they're JS `number` passthroughs (see DIALECT.md: "kept
// as distinct named coercions... not because v1 enforces different
// those. See prelude.ts's header comment for `__toInt`'s exact rounding
// (round-half-away-from-zero, not JS's native Math.round, which rounds
// half toward +Infinity — wrong for negative halves) and range-check
// bounds, and emit-program.test.ts's "emit — type-suffix coercion" tests
// for behavioral coverage (including the OVERFLOW boundary cases).

export {};
