// Expression parsing via precedence-climbing (a Pratt-parser variant) —
// see precedence.ts for the binding-power table.
//
// Implemented: number/string literals, variable references (with suffix),
// unary `-`/`NOT`, parenthesized grouping, and the full binary operator
// set (arithmetic, comparisons, AND/OR — build order step 6). ArrayRef/
// CallExpr parsing (an identifier immediately followed by `(`) is deferred
// to steps 10/13/14 — for now an identifier is always parsed as a bare
// VariableRef, so `A(1)` in an expression position parses `A` as a
// VariableRef and then fails with a ParseError at whatever unexpected `(`
// follows, rather than being silently misinterpreted.

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
