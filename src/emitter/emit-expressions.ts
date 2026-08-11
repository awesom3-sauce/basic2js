// Expression -> JS source-text emission.
//
// Implemented (build order step 4): NumberLiteral, StringLiteral,
// VariableRef, unary "-", and the arithmetic BinOps (+ - * / \ ^ MOD) —
// exactly the Expression shapes the parser currently produces (see
// src/parser/parse-expressions.ts). ArrayRef/CallExpr and the
// comparison/AND/OR/NOT operators are defined in the AST already but have
// explicit throwing cases here (backed by a final `assertNever`), same
// defensive-backstop pattern as src/ir/lower-statements.ts — they land in
// their own build-order steps (6, 10, 13/14).
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
      throw new Error(
        'Internal error: emitting unary "NOT" is not implemented yet (build order step 6)',
      );

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
    case "<>":
    case "<":
    case ">":
    case "<=":
    case ">=":
    case "AND":
    case "OR":
      throw new Error(
        `Internal error: emitting binary "${op}" is not implemented yet (build order step 6)`,
      );

    default:
      return assertNever(op, "emitBinaryExpr");
  }
}
