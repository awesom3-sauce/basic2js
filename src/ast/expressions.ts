// Expression AST node shapes.
//
// TODO (build order step 2, see CLAUDE.md plan / DIALECT.md):
// export type Expression =
//   | { kind: 'NumberLiteral'; value: number }
//   | { kind: 'StringLiteral'; value: string }
//   | { kind: 'VariableRef'; name: string; suffix: TypeSuffix }
//   | { kind: 'ArrayRef'; name: string; suffix: TypeSuffix; indices: Expression[] }
//   | { kind: 'UnaryExpr'; op: '-' | 'NOT'; operand: Expression }
//   | { kind: 'BinaryExpr'; op: BinOp; left: Expression; right: Expression }
//   | { kind: 'CallExpr'; callee: string; args: Expression[] };
//
// export type BinOp = '+' | '-' | '*' | '/' | '\\' | '^' | 'MOD'
//   | '=' | '<>' | '<' | '>' | '<=' | '>=' | 'AND' | 'OR';
//
// Every switch over Expression['kind'] elsewhere in the codebase must end in
// an `assertNever` default case — see CLAUDE.md's exhaustiveness convention.

export {};
