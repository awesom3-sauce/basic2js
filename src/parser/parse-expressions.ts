// Expression parsing via precedence-climbing (a Pratt-parser variant) —
// see precedence.ts for the binding-power table.
//
// Implemented: number/string literals, variable references (with suffix),
// array references (build order step 10), unary `-`/`NOT`, parenthesized
// grouping, and the full binary operator set (arithmetic, comparisons,
// AND/OR — build order step 6).
//
// An identifier immediately followed by `(` is always parsed as an
// ArrayRef (never a CallExpr) — correct for now, since neither builtin
// functions (step 14) nor DEF FN (step 13) exist yet to create ambiguity.
// Once they land, resolving `name(args)` between "array access" / "DEF FN
// call" / "builtin call" will need real disambiguation (e.g. a symbol
// table of known builtin/DEF-FN names checked before falling back to
// array access) — flagged here as a concrete TODO for those steps rather
// than left implicit.

import type { Expression } from "../ast/expressions.js";
import { splitSuffix } from "./identifier.js";
import { lookupBinaryOp, UNARY_MINUS_PRECEDENCE, UNARY_NOT_PRECEDENCE } from "./precedence.js";
import { numberValue, stringValue } from "./token-value.js";
import { ParseError } from "./errors.js";
import type { TokenCursor } from "./token-cursor.js";

export function parseExpression(cursor: TokenCursor, minPrecedence = 0): Expression {
  let left = parseUnary(cursor);

  for (;;) {
    const opInfo = lookupBinaryOp(cursor.current());
    if (opInfo === undefined || opInfo.precedence < minPrecedence) break;

    cursor.advance();
    const nextMinPrecedence = opInfo.rightAssociative ? opInfo.precedence : opInfo.precedence + 1;
    const right = parseExpression(cursor, nextMinPrecedence);
    left = { kind: "BinaryExpr", op: opInfo.op, left, right };
  }

  return left;
}

function parseUnary(cursor: TokenCursor): Expression {
  if (cursor.check("Operator", "-")) {
    cursor.advance();
    const operand = parseExpression(cursor, UNARY_MINUS_PRECEDENCE);
    return { kind: "UnaryExpr", op: "-", operand };
  }
  if (cursor.check("Keyword", "NOT")) {
    cursor.advance();
    const operand = parseExpression(cursor, UNARY_NOT_PRECEDENCE);
    return { kind: "UnaryExpr", op: "NOT", operand };
  }
  return parsePrimary(cursor);
}

function parsePrimary(cursor: TokenCursor): Expression {
  const token = cursor.current();

  if (token.type === "Number") {
    cursor.advance();
    return { kind: "NumberLiteral", value: numberValue(token) };
  }

  if (token.type === "String") {
    cursor.advance();
    return { kind: "StringLiteral", value: stringValue(token) };
  }

  if (token.type === "Identifier") {
    cursor.advance();
    const { name, suffix } = splitSuffix(stringValue(token));
    if (cursor.check("Operator", "(")) {
      return { kind: "ArrayRef", name, suffix, indices: parseIndexList(cursor) };
    }
    return { kind: "VariableRef", name, suffix };
  }

  if (token.type === "Operator" && token.text === "(") {
    cursor.advance();
    const inner = parseExpression(cursor, 0);
    cursor.expect("Operator", ")");
    return inner;
  }

  throw new ParseError(
    `Expected an expression, found ${token.type === "EOL" || token.type === "EOF" ? "end of statement" : `"${token.text}"`}`,
    token.line,
    token.col,
  );
}

/**
 * `"(" expr[, expr...] ")"` — shared by ArrayRef expressions, array
 * element l-values, and DIM declarations (see parse-statements.ts).
 */
export function parseIndexList(cursor: TokenCursor): Expression[] {
  cursor.expect("Operator", "(");
  const indices: Expression[] = [];
  for (;;) {
    indices.push(parseExpression(cursor));
    if (!cursor.match("Operator", ",")) break;
  }
  cursor.expect("Operator", ")");
  return indices;
}
