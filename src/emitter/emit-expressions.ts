// Expression -> JS source-text emission.
//
// Implemented: NumberLiteral, StringLiteral, VariableRef, unary "-"/"NOT",
// and the full BinOp set — arithmetic (+ - * / \ ^ MOD, build order step
// 4) plus comparisons and AND/OR (build order step 6) — exactly the
// Expression shapes the parser currently produces (see
// src/parser/parse-expressions.ts). ArrayRef/CallExpr are defined in the
// AST already but have an explicit throwing case here (backed by a final
// `assertNever`), same defensive-backstop pattern as
// src/ir/lower-statements.ts — they land in their own build-order steps
// (10, 13/14).
//
// Every composite sub-expression (UnaryExpr, BinaryExpr) is emitted fully
// parenthesized, so nesting composes safely regardless of JS's own
// operator precedence — the AST's tree shape is the only thing that needs
// to be correct; the emitted text doesn't need to replicate BASIC's
// precedence rules itself (already resolved by the parser into tree
// structure).

import type { BinOp, Expression, UnaryOp } from "../ast/expressions.js";
import { varKey } from "./mangle.js";
import { assertNever } from "../util/assert-never.js";

export function emitExpression(expr: Expression): string {
  switch (expr.kind) {
    case "NumberLiteral":
      return String(expr.value);

    case "StringLiteral":
      return JSON.stringify(expr.value);

    case "VariableRef":
      return `V[${JSON.stringify(varKey(expr.name, expr.suffix))}]`;

    case "UnaryExpr":
      return emitUnaryExpr(expr.op, expr.operand);

    case "BinaryExpr":
      return emitBinaryExpr(expr.op, expr.left, expr.right);

    case "ArrayRef":
      throw new Error(
        'Internal error: emitting "ArrayRef" is not implemented yet (build order step 10)',
      );

    case "CallExpr":
      throw new Error(
        'Internal error: emitting "CallExpr" is not implemented yet (build order steps 13/14)',
      );

    default:
      return assertNever(expr, "emitExpression");
  }
}

function emitUnaryExpr(op: UnaryOp, operand: Expression): string {
  switch (op) {
    case "-":
      return `(-${emitExpression(operand)})`;

    case "NOT":
      // BASIC's NOT is a bitwise complement, not JS's logical "!" — see
      // the BinaryExpr AND/OR case below for the same reasoning. For the
      // common case of operands that are themselves comparison/logical
      // results (0 = false, -1 = true), ~0 = -1 and ~(-1) = 0, which is
      // exactly logical negation.
      return `(~${emitExpression(operand)})`;

    default:
      return assertNever(op, "emitUnaryExpr");
  }
}

function emitBinaryExpr(op: BinOp, left: Expression, right: Expression): string {
  const l = emitExpression(left);
  const r = emitExpression(right);

  switch (op) {
    case "+":
      // Overloaded in BASIC between numeric addition and string
      // concatenation, same as JS's "+" for those same two cases — no
      // runtime type dispatch needed as long as operand types actually
      // match (unverified until the semantic analyzer lands, step 15/16).
      return `(${l} + ${r})`;

    case "-":
    case "*":
    case "/":
      return `(${l} ${op} ${r})`;

    case "\\":
      // Integer division, truncating toward zero. Known simplification:
      // real GW-BASIC may round each operand to an integer before
      // dividing rather than just truncating the final quotient —
      // unverified, revisit in step 14/16 polish if it matters.
      return `Math.trunc(${l} / ${r})`;

    case "^":
      return `(${l} ** ${r})`;

    case "MOD":
      // JS's % is truncating-division remainder (sign follows the
      // dividend) — verified against Microsoft BASIC's documented MOD
      // behavior, they match exactly. See DIALECT.md.
      return `(${l} % ${r})`;

    case "=":
      return `(${l} === ${r} ? -1 : 0)`;

    case "<>":
      return `(${l} !== ${r} ? -1 : 0)`;

    case "<":
    case ">":
    case "<=":
    case ">=":
      // Classic BASIC represents TRUE as -1 and FALSE as 0, not JS's
      // boolean true/false — comparisons produce a number so they compose
      // with arithmetic/AND/OR the way BASIC expects (e.g. `-(A < B)`,
      // `(A < B) + (C > D)`).
      return `(${l} ${op} ${r} ? -1 : 0)`;

    case "AND":
      // Bitwise, not JS's logical "&&" — matches BASIC's "operate on
      // numeric-truthiness" AND/OR semantics (see DIALECT.md). For the
      // common case of both operands being 0/-1 (comparison results),
      // this is exactly logical AND; for arbitrary integers it's a true
      // bitwise AND, matching real BASIC.
      return `(${l} & ${r})`;

    case "OR":
      return `(${l} | ${r})`;

    default:
      return assertNever(op, "emitBinaryExpr");
  }
}
