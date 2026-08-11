// PRINT emission: builds the JS statements that compute a PRINT
// statement's full output text and call `await rt.print(...)`.
//
// Number formatting (leading space if non-negative, trailing space always
// — see DIALECT.md) and comma tab-zone padding rely on __fmtNum/__tabPad
// from prelude.ts. Whether a given value expression is a number or a
// string is inferred statically here (BASIC's type suffixes make this
// knowable, for everything the parser currently supports, without a full
// semantic pass — see inferValueType below); this is a best-effort
// heuristic for PRINT formatting only, not a substitute for the real
// type-checking semantic analyzer (build order step 15/16).
//
// Known simplification: comma tab-zone padding is computed from a column
// counter that resets to 0 at the start of every PRINT statement, not
// tracked across statements/lines. A previous PRINT ending in `;`/`,`
// (suppressing its newline) leaves the real terminal cursor at a nonzero
// column that this doesn't account for. Revisit in step 14 (formatting.ts)
// if real cross-statement column tracking turns out to matter.

import type { Expression } from "../ast/expressions.js";
import type { PrintSegment } from "../ast/statements.js";
import { emitExpression } from "./emit-expressions.js";
import { assertNever } from "../util/assert-never.js";

function inferValueType(expr: Expression): "number" | "string" {
  switch (expr.kind) {
    case "NumberLiteral":
      return "number";

    case "StringLiteral":
      return "string";

    case "VariableRef":
    case "ArrayRef":
      return expr.suffix === "$" ? "string" : "number";

    case "UnaryExpr":
      // Both "-" and (once step 6 lands) "NOT" are numeric-only in BASIC.
      return "number";

    case "BinaryExpr":
      // "+" is the only BASIC operator overloaded between numeric and
      // string results; every other implemented BinOp is numeric-only.
      if (expr.op === "+") {
        return inferValueType(expr.left) === "string" || inferValueType(expr.right) === "string"
          ? "string"
          : "number";
      }
      return "number";

    case "CallExpr":
      // Best-effort default until step 14 adds a builtin return-type table.
      return "number";

    default:
      return assertNever(expr, "inferValueType");
  }
}

/**
 * Returns the JS statements (as source text) that build and print one
 * PRINT statement's output, given its segments. Callers embed this inside
 * a `case` body that already has its own block scope (see
 * emit-statements.ts) — it declares a local `__s`.
 */
export function emitPrintCall(segments: readonly PrintSegment[]): string {
  const lines: string[] = ['let __s = "";'];
  let suppressNewline = false;

  for (const segment of segments) {
    suppressNewline = segment.kind === "sep";

    if (segment.kind === "sep") {
      if (segment.sep === ",") {
        lines.push("__s += __tabPad(__s.length);");
      }
      // ";" contributes no characters of its own — direct concatenation.
      continue;
    }

    const valueJs = emitExpression(segment.expr);
    const formatted =
      inferValueType(segment.expr) === "number" ? `__fmtNum(${valueJs})` : `String(${valueJs})`;
    lines.push(`__s += ${formatted};`);
  }

  if (!suppressNewline) lines.push('__s += "\\n";');
  lines.push("await rt.print(__s);");
  return lines.join(" ");
}
