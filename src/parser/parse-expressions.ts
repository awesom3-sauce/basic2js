// Expression parsing via precedence-climbing (a Pratt-parser variant) —
// see precedence.ts for the binding-power table.
//
// Implemented: number/string literals, variable references (with suffix),
// array references (build order step 10), builtin function calls (build
// order step 14), unary `-`/`NOT`, parenthesized grouping, and the full
// binary operator set (arithmetic, comparisons, AND/OR — build order
// step 6).
//
// `FN name(args)` (build order step 13) is unambiguous by construction:
// it's always preceded by the `FN` keyword (see parseDefFnStmt's scope
// note in parse-statements.ts on why a space between `FN` and the name is
// required), so it's recognized as its own CallExpr case in parsePrimary
// below, never confused with ArrayRef.
//
// A bare (non-FN-prefixed) `identifier(` is disambiguated against
// `builtins.ts`'s BUILTIN_FUNCTIONS table: a name+suffix that matches a
// known builtin parses as a CallExpr (with an arity check against the same
// table); anything else parses as an ArrayRef, as before. See builtins.ts's
// header comment for the "only reserved in call position" scope decision,
// and its GWBASIC_ONLY_BUILTINS for the (currently one-member) subset
// that's only reserved when the "gwbasic" dialect is active (see
// src/dialect.ts).

import type { Expression } from "../ast/expressions.js";
import { lookupBuiltin } from "./builtins.js";
import { splitSuffix } from "./identifier.js";
import { lookupBinaryOp, UNARY_MINUS_PRECEDENCE, UNARY_NOT_PRECEDENCE } from "./precedence.js";
import { numberValue, stringValue } from "./token-value.js";
import { ParseError } from "./errors.js";
import type { TokenCursor } from "./token-cursor.js";
import { isBuiltinAvailable } from "../dialect.js";

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
      const calleeKey = name + suffix;
      const builtin = lookupBuiltin(calleeKey);
      // A dialect-restricted builtin (currently just gwbasic's EOF) is
      // only reserved when its owning dialect is active (see
      // src/dialect.ts) — otherwise it's treated exactly as if it weren't
      // in the registry at all, falling through to the ordinary ArrayRef
      // case below.
      if (builtin !== undefined && isBuiltinAvailable(cursor.dialectSpec, calleeKey)) {
        const args = parseIndexList(cursor);
        if (args.length < builtin.min || args.length > builtin.max) {
          throw new ParseError(
            `${calleeKey.toUpperCase()} expects ${describeArity(builtin)}, got ${args.length}`,
            token.line,
            token.col,
          );
        }
        return { kind: "CallExpr", callee: calleeKey, args };
      }
      return { kind: "ArrayRef", name, suffix, indices: parseIndexList(cursor) };
    }
    return { kind: "VariableRef", name, suffix };
  }

  if (token.type === "Keyword" && token.text === "FN") {
    cursor.advance();
    const { name, suffix } = splitSuffix(stringValue(cursor.expect("Identifier")));
    // A DEF FN call always has parens, even for a zero-argument function
    // (`FN A()`), unlike a bare VariableRef — so an explicit "(" is
    // required here rather than optional the way ArrayRef's isn't.
    const args = parseIndexList(cursor);
    return { kind: "CallExpr", callee: name + suffix, args };
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

function describeArity(builtin: { readonly min: number; readonly max: number }): string {
  if (builtin.min === builtin.max) {
    return `${builtin.min} argument${builtin.min === 1 ? "" : "s"}`;
  }
  return `${builtin.min} to ${builtin.max} arguments`;
}

/**
 * `"(" [expr[, expr...]] ")"` — shared by ArrayRef expressions, array
 * element l-values, DIM declarations (see parse-statements.ts), and
 * `FN name(...)` call expressions. Allows an empty list (`FN PI()`, a
 * zero-argument DEF FN call, is valid BASIC) even though a real array
 * reference/DIM always has at least one index in practice — permissive
 * here, not worth a separate near-duplicate parser for that distinction.
 */
export function parseIndexList(cursor: TokenCursor): Expression[] {
  cursor.expect("Operator", "(");
  const indices: Expression[] = [];
  if (!cursor.check("Operator", ")")) {
    for (;;) {
      indices.push(parseExpression(cursor));
      if (!cursor.match("Operator", ",")) break;
    }
  }
  cursor.expect("Operator", ")");
  return indices;
}
