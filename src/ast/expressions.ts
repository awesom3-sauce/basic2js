// Expression AST node shapes.
//
// Every switch over `Expression['kind']` elsewhere in the codebase must end
// in a `default: return assertNever(node);` case — see
// src/util/assert-never.ts and CLAUDE.md's exhaustiveness convention.
//
// Parser support status (build order step 2, "minimal parser subset"):
// NumberLiteral, StringLiteral, VariableRef, UnaryExpr ("-" only), and
// BinaryExpr for the arithmetic operators (+ - * / \ ^ MOD) are
// implemented — see src/parser/parse-expressions.ts. ArrayRef and CallExpr
// are defined here as types now (cheap, and DIM/builtin/DEF FN consumers
// will want a stable shape to target) but have no parser support yet —
// that lands in build order steps 10 (DIM/arrays), 13 (DEF FN), and 14
// (builtin functions). Comparison operators, AND/OR/NOT, and NOT as a
// unary op are deferred to step 6 (IF/THEN + full operator precedence).

import type { TypeSuffix } from "./types.js";

export type Expression =
  NumberLiteral | StringLiteral | VariableRef | ArrayRef | UnaryExpr | BinaryExpr | CallExpr;

export interface NumberLiteral {
  readonly kind: "NumberLiteral";
  readonly value: number;
}

export interface StringLiteral {
  readonly kind: "StringLiteral";
  readonly value: string;
}

export interface VariableRef {
  readonly kind: "VariableRef";
  readonly name: string;
  readonly suffix: TypeSuffix;
}

/** `name(indices...)` used as a value — e.g. `A(I, J)`. Step 10+. */
export interface ArrayRef {
  readonly kind: "ArrayRef";
  readonly name: string;
  readonly suffix: TypeSuffix;
  readonly indices: readonly Expression[];
}

export interface UnaryExpr {
  readonly kind: "UnaryExpr";
  readonly op: UnaryOp;
  readonly operand: Expression;
}

export interface BinaryExpr {
  readonly kind: "BinaryExpr";
  readonly op: BinOp;
  readonly left: Expression;
  readonly right: Expression;
}

/**
 * `name(args...)` used as a value where `name` isn't a known array — i.e. a
 * builtin function call (LEFT$, INT, ...) or a `DEF FN` call. Which one it
 * is gets resolved later (semantic analysis / emitter), not at parse time —
 * see DIALECT.md.
 */
export interface CallExpr {
  readonly kind: "CallExpr";
  readonly callee: string;
  readonly args: readonly Expression[];
}

export type UnaryOp = "-" | "NOT";

export type BinOp =
  "+" | "-" | "*" | "/" | "\\" | "^" | "MOD" | "=" | "<>" | "<" | ">" | "<=" | ">=" | "AND" | "OR";
