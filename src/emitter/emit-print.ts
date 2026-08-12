// PRINT emission: builds the JS statements that compute a PRINT
// statement's full output text and call `await rt.print(...)`.
//
// Number formatting (leading space if non-negative, trailing space always
// — see DIALECT.md) and comma tab-zone padding rely on __fmtNum/__tabPad
// from prelude.ts; TAB(col)/SPC(n) segments (build order step 14) rely on
// __tabTo/__spc, sharing __s.length as the "current column" the way the
// comma tab-zone case already did. Whether a given value expression is a
// number or a string is inferred statically via ast/infer-type.ts's
// `inferExpressionType` (shared with the semantic analyzer's compile-time
// type-mismatch checking, build order step 15) — a best-effort heuristic
// good enough for PRINT formatting purposes for everything the parser
// currently supports.
//
// Known simplification: comma/TAB column tracking is computed from a
// counter that resets to 0 at the start of every PRINT statement, not
// tracked across statements/lines. A previous PRINT ending in `;`/`,`
// (suppressing its newline) leaves the real terminal cursor at a nonzero
// column that this doesn't account for. Revisit if real cross-statement
// column tracking turns out to matter for a golden program.

import { inferExpressionType } from "../ast/infer-type.js";
import type { PrintSegment } from "../ast/statements.js";
import { emitExpression } from "./emit-expressions.js";
import { assertNever } from "../util/assert-never.js";

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

    switch (segment.kind) {
      case "sep":
        if (segment.sep === ",") {
          lines.push("__s += __tabPad(__s.length);");
        }
        // ";" contributes no characters of its own — direct concatenation.
        break;

      case "value": {
        const valueJs = emitExpression(segment.expr);
        const formatted =
          inferExpressionType(segment.expr) === "number"
            ? `__fmtNum(${valueJs})`
            : `String(${valueJs})`;
        lines.push(`__s += ${formatted};`);
        break;
      }

      case "tab":
        lines.push(`__s += __tabTo(__s.length, ${emitExpression(segment.expr)});`);
        break;

      case "spc":
        lines.push(`__s += __spc(${emitExpression(segment.expr)});`);
        break;

      default:
        assertNever(segment, "emitPrintCall");
    }
  }

  if (!suppressNewline) lines.push('__s += "\\n";');
  lines.push("await rt.print(__s);");
  return lines.join(" ");
}
