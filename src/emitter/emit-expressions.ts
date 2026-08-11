// Expression -> JS source-text emission.
//
// TODO (build order step 4, expanded through step 14): export function
// emitExpression(expr: Expression): string
// - NumberLiteral/StringLiteral -> JS literal.
// - VariableRef/ArrayRef -> V['key'] / ARR['key'][i] via mangle.ts's varKey.
// - BinaryExpr/UnaryExpr -> JS operator where semantics match 1:1 (+ - * <
//   etc.), or a runtime helper call where they don't (\ integer div, MOD,
//   ^ exponent, string concatenation vs numeric +, AND/OR as BASIC's
//   bitwise-on-truthy-numbers semantics rather than JS && / ||).
// - CallExpr -> runtime-calls.ts lookup -> `rt.<helper>(args...)` or
//   `<sharedHelper>(args...)`.

export {};
