// Lowering helpers for expressions embedded within steps. Expressions
// mostly pass through unchanged into emitted JS expressions — this module
// exists for any expression-level rewriting lowering needs (e.g. resolving
// FN calls, DEF FN body substitution).
//
// TODO (build order step 13 for DEF FN; otherwise expressions are lowered
// inline by lower-statements.ts / emit-expressions.ts).

export {};
