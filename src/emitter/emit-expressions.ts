// Expression -> JS source-text emission.
//
// Implemented: NumberLiteral, StringLiteral, VariableRef, ArrayRef (build
// order step 10), CallExpr (either a `DEF FN` call, build order step 13, or
// a builtin call like LEFT$/INT, build order step 14), unary "-"/"NOT", and
// the full BinOp set — arithmetic (+ - * / \ ^ MOD, build order step 4)
// plus comparisons and AND/OR (build order step 6) — exactly the
// Expression shapes the parser currently produces (see
// src/parser/parse-expressions.ts). CallExpr distinguishes "call a
// builtin" from "call a DEF FN" by checking `expr.callee` against
// runtime-calls.ts's RUNTIME_CALLS table first (see its own doc comment
// for why that's unambiguous), falling back to `FN[...]` for anything not
// in that table.
//
// Every composite sub-expression (UnaryExpr, BinaryExpr) is emitted fully
// parenthesized, so nesting composes safely regardless of JS's own
// operator precedence — the AST's tree shape is the only thing that needs
// to be correct; the emitted text doesn't need to replicate BASIC's
// precedence rules itself (already resolved by the parser into tree
// structure).
//
// `locals`: the set of varKeys currently shadowed by DEF FN parameters
// (empty everywhere except while emitting a DEF FN body — see
// emit-program.ts). A VariableRef whose key is in `locals` emits a
// reference to the real JS function parameter (via mangleParamName)
// instead of a V[...] lookup, so JS's own parameter scoping does the
// "parameter shadows a same-named global, only within this function body"
// work for free. Threaded through every recursive call so a shadowed
// variable is still recognized arbitrarily deep inside the body (e.g.
// inside a nested FN call's arguments, or an array index expression).
//
// CAUTION for future signature changes: adding this optional `locals`
// parameter broke every existing bare `.map(emitExpression)` call site
// across the emitter (emit-input.ts, emit-read.ts, emit-statements.ts) —
// Array.prototype.map invokes its callback as (value, index, array), so
// the numeric `index` silently landed in `locals`, and `locals.has(...)`
// threw at runtime. All call sites were fixed to wrap in an explicit
// arrow (`.map((e) => emitExpression(e))`), but adding *any* new optional
// parameter here again would reintroduce the same class of bug at every
// bare-reference call site — grep for `.map(emitExpression)` (and
// `.map(emitJumpTarget)`, same risk) before changing this signature again.

import type { BinOp, Expression, UnaryOp } from "../ast/expressions.js";
import { mangleParamName, varKey } from "./mangle.js";
import { RUNTIME_CALLS } from "./runtime-calls.js";
import { assertNever } from "../util/assert-never.js";

const NO_LOCALS: ReadonlySet<string> = new Set();

export function emitExpression(expr: Expression, locals: ReadonlySet<string> = NO_LOCALS): string {
  switch (expr.kind) {
    case "NumberLiteral":
      return String(expr.value);

    case "StringLiteral":
      return JSON.stringify(expr.value);

    case "VariableRef": {
      const key = varKey(expr.name, expr.suffix);
      return locals.has(key) ? mangleParamName(key) : `V[${JSON.stringify(key)}]`;
    }

    case "UnaryExpr":
      return emitUnaryExpr(expr.op, expr.operand, locals);

    case "BinaryExpr":
      return emitBinaryExpr(expr.op, expr.left, expr.right, locals);

    case "ArrayRef": {
      const key = JSON.stringify(varKey(expr.name, expr.suffix));
      const indices = `[${expr.indices.map((i) => emitExpression(i, locals)).join(", ")}]`;
      const isString = expr.suffix === "$";
      return `__arrGet(ARR, ${key}, ${indices}, ${isString})`;
    }

    case "CallExpr": {
      const args = expr.args.map((a) => emitExpression(a, locals));
      // The parser only ever produces a bare (non-`FN`-prefixed) CallExpr
      // for a name matching builtins.ts's registry, and only ever produces
      // an `FN`-prefixed one for an arbitrary DEF FN name — so checking
      // the builtin registry here unambiguously recovers which case this
      // is, with no extra discriminant needed on the node itself (see
      // CallExpr's doc comment in ast/expressions.ts).
      const emitBuiltin = RUNTIME_CALLS.get(expr.callee);
      if (emitBuiltin !== undefined) return emitBuiltin(args);
      return `FN[${JSON.stringify(expr.callee)}](${args.join(", ")})`;
    }

    default:
      return assertNever(expr, "emitExpression");
  }
}

function emitUnaryExpr(op: UnaryOp, operand: Expression, locals: ReadonlySet<string>): string {
  switch (op) {
    case "-":
      return `(-${emitExpression(operand, locals)})`;

    case "NOT":
      // BASIC's NOT is a bitwise complement, not JS's logical "!" — see
      // the BinaryExpr AND/OR case below for the same reasoning. For the
      // common case of operands that are themselves comparison/logical
      // results (0 = false, -1 = true), ~0 = -1 and ~(-1) = 0, which is
      // exactly logical negation.
      return `(~${emitExpression(operand, locals)})`;

    default:
      return assertNever(op, "emitUnaryExpr");
  }
}

function emitBinaryExpr(
  op: BinOp,
  left: Expression,
  right: Expression,
  locals: ReadonlySet<string>,
): string {
  const l = emitExpression(left, locals);
  const r = emitExpression(right, locals);

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
