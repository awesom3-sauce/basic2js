// Best-effort static type inference for an Expression — "number" or
// "string", per BASIC's %/!/#/$ suffix system. Shared by the semantic
// analyzer (src/semantics/analyze.ts, build order step 15's compile-time
// type-mismatch checking) and the emitter (src/emitter/emit-print.ts's
// PRINT-value formatting, build order step 4/14) — both need exactly the
// same "what type does this expression produce" answer, so this lives at
// the `ast/` layer both of them already depend on, rather than being
// duplicated or having one depend on the other.
//
// This is deliberately *not* a full type-checker: it infers a type for
// every expression shape the parser can produce, using only local
// information (an identifier's own suffix, an operator's own semantics),
// with no unification or context propagation. A CallExpr's type is read
// straight off its callee's spelling ("$"-suffixed name => string, per
// DIALECT.md's `$` suffix convention) — this works uniformly for both
// builtin calls (LEFT$, LEN, ...) and DEF FN calls (a `$`-suffixed
// function name), with no need to distinguish the two or look either
// registry up, since a DEF FN's own suffix governs the same way a
// variable's does.

import type { Expression } from "./expressions.js";
import { assertNever } from "../util/assert-never.js";

export type BasicType = "number" | "string";

export function inferExpressionType(expr: Expression): BasicType {
  switch (expr.kind) {
    case "NumberLiteral":
      return "number";

    case "StringLiteral":
      return "string";

    case "VariableRef":
    case "ArrayRef":
      return expr.suffix === "$" ? "string" : "number";

    case "UnaryExpr":
      // Both "-" and "NOT" are numeric-only in BASIC.
      return "number";

    case "BinaryExpr":
      // "+" is the only BASIC operator overloaded between numeric and
      // string results; every other BinOp is numeric-only (comparisons
      // produce BASIC's numeric TRUE/FALSE, not a string).
      if (expr.op === "+") {
        return inferExpressionType(expr.left) === "string" ||
          inferExpressionType(expr.right) === "string"
          ? "string"
          : "number";
      }
      return "number";

    case "CallExpr":
      return expr.callee.endsWith("$") ? "string" : "number";

    default:
      return assertNever(expr, "inferExpressionType");
  }
}
