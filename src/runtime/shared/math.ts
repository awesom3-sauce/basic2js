// Math builtin implementations: INT (Math.floor — distinct from the %
// suffix's round-based coercion in values.ts), ABS, SQR, SGN, SIN, COS, TAN.
//
// TODO (build order step 14, with unit tests for edge cases): SQR of a
// negative number (ILLEGAL_FUNCTION_CALL error), integer division `\` and
// MOD with negative operands (match BASIC's truncating semantics, not JS's),
// `^` with fractional/negative exponents.

export {};
