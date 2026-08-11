// Type-suffix coercion helpers, applied at assignment time (LET, FOR-loop
// variable update, READ, INPUT, array-element store) — not to every
// intermediate expression. See DIALECT.md for the %/!/#/$ semantics table.
//
// TODO (build order step 15):
// - basicInt(n): round-half-away-from-zero, then range-check
//   [-32768, 32767], else throw an OVERFLOW BasicRuntimeError. Distinct from
//   the INT() builtin (Math.floor) — real GW-BASIC differs between the two.
// - basicSingle(n) / basicDouble(n): passthroughs (JS number covers both;
//   kept distinct for clarity and future precision tuning).
// - basicStr(s): identity, but type-checks the source is actually a string.

export {};
