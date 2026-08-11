// Expression AST node shapes.
//
// Every switch over `Expression['kind']` elsewhere in the codebase must end
// in a `default: return assertNever(node);` case — see
// src/util/assert-never.ts and CLAUDE.md's exhaustiveness convention.
//
// Parser support status: every variant below has real parser support as of
// build order step 14 (ArrayRef landed in step 10, CallExpr's two call
// forms — `FN name(...)` and builtin calls like `LEN(...)` — landed in
// steps 13 and 14 respectively) — see src/parser/parse-expressions.ts.

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
 * builtin function call (LEFT$, INT, ...) or a `DEF FN` call. The parser
 * already knows which at parse time (a builtin name-match vs. an
 * `FN`-keyword prefix — see parse-expressions.ts), but that distinction
 * isn't recorded on the node itself: `callee` uses the same lowercase
 * `name + suffix` spelling either way, and the emitter re-derives which
 * case it is by checking `callee` against the builtin registry (see
 * emit-expressions.ts) rather than carrying an extra discriminant field.
 */
export interface CallExpr {
  readonly kind: "CallExpr";
  readonly callee: string;
  readonly args: readonly Expression[];
}

export type UnaryOp = "-" | "NOT";

export type BinOp =
  "+" | "-" | "*" | "/" | "\\" | "^" | "MOD" | "=" | "<>" | "<" | ">" | "<=" | ">=" | "AND" | "OR";
