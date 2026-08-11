// Binary-operator binding-power lookup for BASIC expression parsing
// (precedence-climbing, a Pratt-parser variant), used by
// parse-expressions.ts.
//
// Scope note (build order step 2, "minimal parser subset"): only the
// arithmetic operators are wired up here — ^, unary -, * / \, MOD, + -.
// Comparison operators (= <> < > <= >=) and the logical operators
// (AND OR NOT) are lexed already (see src/lexer/keywords.ts and
// SINGLE_CHAR_OPERATORS in lexer.ts) but their precedence relative to each
// other and to arithmetic needs to be validated once IF/THEN actually
// exercises them — that's build order step 6, which is also when this
// table gets extended and the final precedence is locked into DIALECT.md's
// "Operators" section (the ordering already sketched there — ^ > unary- >
// * / > \ > MOD > + - > comparisons > NOT > AND > OR — is the target, not
// yet implemented below that boundary).
//
// Higher precedence number = binds tighter. Assignment "=" is never looked
// up here: LET/implicit-assignment statement parsing always consumes its
// "=" itself, before calling into expression parsing for the right-hand
// side, so it never reaches this table.

import type { Token } from "../lexer/token.js";
import type { BinOp } from "../ast/expressions.js";

export interface BinaryOpInfo {
  readonly op: BinOp;
  readonly precedence: number;
  readonly rightAssociative: boolean;
}

/**
 * The minimum precedence to use when parsing a unary minus's operand —
 * between `^` (7, so `-2^2` parses as `-(2^2)`, i.e. unary binds looser
 * than exponentiation) and `*`/`/` (5, so `-2*3` parses as `(-2)*3`, i.e.
 * unary binds tighter than the operators below it).
 */
export const UNARY_MINUS_PRECEDENCE = 6;

const ARITHMETIC_OPERATORS: Readonly<Record<string, BinaryOpInfo>> = {
  "^": { op: "^", precedence: 7, rightAssociative: true },
  "*": { op: "*", precedence: 5, rightAssociative: false },
  "/": { op: "/", precedence: 5, rightAssociative: false },
  "\\": { op: "\\", precedence: 4, rightAssociative: false },
  "+": { op: "+", precedence: 2, rightAssociative: false },
  "-": { op: "-", precedence: 2, rightAssociative: false },
};

/**
 * Returns binding-power info if `token` is a currently-supported binary
 * operator (the arithmetic set above, plus the `MOD` keyword), else
 * `undefined` — meaning "stop climbing here", whether because the token
 * isn't an operator at all or because it's a comparison/AND/OR operator
 * that's deferred to step 6.
 */
export function lookupBinaryOp(token: Token): BinaryOpInfo | undefined {
  if (token.type === "Operator") {
    return ARITHMETIC_OPERATORS[token.text];
  }
  if (token.type === "Keyword" && token.text === "MOD") {
    return { op: "MOD", precedence: 3, rightAssociative: false };
  }
  return undefined;
}
