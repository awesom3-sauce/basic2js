// Binary-operator binding-power lookup for BASIC expression parsing
// (precedence-climbing, a Pratt-parser variant), used by
// parse-expressions.ts.
//
// Full table now wired up (build order step 6): arithmetic, comparisons,
// and AND/OR — locked into DIALECT.md's "Operators" section as:
// `^` > unary `-` > `* /` > `\` > `MOD` > `+ -` > comparisons > `NOT` >
// `AND` > `OR` (highest to lowest binding power).
//
// Higher precedence number = binds tighter. Assignment "=" is never looked
// up here: LET/implicit-assignment statement parsing always consumes its
// "=" itself, before calling into expression parsing for the right-hand
// side, so the "=" *comparison* operator and "=" *assignment* token never
// collide despite sharing a spelling.

import type { Token } from "../lexer/token.js";
import type { BinOp } from "../ast/expressions.js";

export interface BinaryOpInfo {
  readonly op: BinOp;
  readonly precedence: number;
  readonly rightAssociative: boolean;
}

/**
 * Minimum precedence for a unary minus's operand — between `^` (9, so
 * `-2^2` parses as `-(2^2)`) and `*`/`/` (7, so `-2*3` parses as `(-2)*3`).
 */
export const UNARY_MINUS_PRECEDENCE = 8;

/**
 * Minimum precedence for a `NOT`'s operand — between comparisons (3, so
 * `NOT A > B` parses as `NOT (A > B)`) and `AND` (1, so `NOT A AND B`
 * parses as `(NOT A) AND B`, not `NOT (A AND B)`).
 */
export const UNARY_NOT_PRECEDENCE = 2;

const OPERATORS: Readonly<Record<string, BinaryOpInfo>> = {
  "^": { op: "^", precedence: 9, rightAssociative: true },
  "*": { op: "*", precedence: 7, rightAssociative: false },
  "/": { op: "/", precedence: 7, rightAssociative: false },
  "\\": { op: "\\", precedence: 6, rightAssociative: false },
  "+": { op: "+", precedence: 4, rightAssociative: false },
  "-": { op: "-", precedence: 4, rightAssociative: false },
  "=": { op: "=", precedence: 3, rightAssociative: false },
  "<>": { op: "<>", precedence: 3, rightAssociative: false },
  "<": { op: "<", precedence: 3, rightAssociative: false },
  ">": { op: ">", precedence: 3, rightAssociative: false },
  "<=": { op: "<=", precedence: 3, rightAssociative: false },
  ">=": { op: ">=", precedence: 3, rightAssociative: false },
};

/** MOD/AND/OR are lexed as Keyword tokens, not Operator tokens — see keywords.ts. */
const KEYWORD_OPERATORS: Readonly<Record<string, BinaryOpInfo>> = {
  MOD: { op: "MOD", precedence: 5, rightAssociative: false },
  AND: { op: "AND", precedence: 1, rightAssociative: false },
  OR: { op: "OR", precedence: 0, rightAssociative: false },
};

/**
 * Returns binding-power info if `token` is a binary operator, else
 * `undefined` — meaning "stop climbing here" (not an operator at all).
 */
export function lookupBinaryOp(token: Token): BinaryOpInfo | undefined {
  if (token.type === "Operator") {
    return OPERATORS[token.text];
  }
  if (token.type === "Keyword") {
    return KEYWORD_OPERATORS[token.text];
  }
  return undefined;
}
