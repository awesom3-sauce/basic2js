// Math builtin implementations: INT (Math.floor — distinct from the %
// suffix's round-based coercion in values.ts), ABS, SQR, SGN, SIN, COS, TAN.
//
// Scope note (build order step 14): same decision as strings.ts (see its
// header comment) — these are pure and stateless, so they're implemented
// directly as plain JS in src/emitter/prelude.ts (INT/ABS/SIN/COS/TAN emit
// a bare `Math.*` call inline via runtime-calls.ts, with no helper needed;
// SQR/SGN get dedicated `__sqr`/`__sgn` prelude helpers since SQR needs a
// negative-input error check and SGN has no single built-in JS equivalent).
// Nothing outside emitted code needs this logic, so this file stays a stub
// rather than growing an unused, drift-prone second copy. See DIALECT.md's
// builtin function table and emit-program.test.ts's "emit — builtins" tests
// for the actual behavior/edge cases (SQR of a negative number raising
// ILLEGAL FUNCTION CALL, INT's floor vs. %-suffix's round-based coercion
// staying deliberately different, ...).

export {};
