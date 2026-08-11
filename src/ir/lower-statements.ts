// Per-statement-kind lowering: Statement -> Step[] fragments.
//
// Implemented (build order step 3, "linear/GOTO-only subset"): PrintStmt,
// LetStmt, GotoStmt, RemStmt, EndStmt, StopStmt all lower 1:1 into a single
// Step. Every other Statement kind is handled by an explicit case that
// throws — the parser doesn't produce them yet (unsupported keywords raise
// a ParseError before lowering ever runs), so these branches exist purely
// as a defensive backstop and, together with the final `assertNever`, keep
// this switch exhaustive: adding a new Statement kind without updating this
// file becomes a compile-time TS error. Each one gets a real
// implementation in its own build-order step — see the per-construct rules
// in CLAUDE.md's "dispatch-loop / virtual-PC emitter" section:
// - IfStmt (step 6): recursively lower THEN/ELSE clause statements into
//   their own steps; falling off the end always jumps to the start of the
//   *next source line*, not the next colon-statement.
// - ForStmt/NextStmt (step 7): runtime forStack frames (GOTO can jump
//   into/out of loop bodies, so pairing must be dynamic, not static).
// - GosubStmt/ReturnStmt/OnJumpStmt (step 8): runtime gosubStack of return
//   step-indices; ON...GOTO/GOSUB out-of-range selector falls through with
//   no error (locked default, see DIALECT.md).
// - InputStmt (step 9).
// - DimStmt (step 10).
// - DataStmt/ReadStmt/RestoreStmt (step 11): DATA is collected in a
//   separate pre-pass over the whole Program (see lowering.ts) and is not
//   itself lowered to a Step (it's non-executable).
// - WhileStmt/WendStmt (step 12): purely static bracket-matching at
//   lowering time, unlike FOR/NEXT's runtime stack.
// - DefFnStmt (step 13).

import type { Statement } from "../ast/statements.js";
import type { Step } from "./program.js";
import { assertNever } from "../util/assert-never.js";

export function lowerStatement(statement: Statement, line: number): Step[] {
  switch (statement.kind) {
    case "PrintStmt":
      return [{ kind: "Print", line, segments: statement.segments }];

    case "LetStmt":
      return [{ kind: "Let", line, target: statement.target, value: statement.value }];

    case "GotoStmt":
      return [{ kind: "Goto", line, target: statement.target }];

    case "RemStmt":
      return [{ kind: "NoOp", line }];

    case "EndStmt":
    case "StopStmt":
      return [{ kind: "Halt", line }];

    case "InputStmt":
    case "IfStmt":
    case "ForStmt":
    case "NextStmt":
    case "GosubStmt":
    case "ReturnStmt":
    case "OnJumpStmt":
    case "WhileStmt":
    case "WendStmt":
    case "DimStmt":
    case "DataStmt":
    case "ReadStmt":
    case "RestoreStmt":
    case "DefFnStmt":
      throw new Error(
        `Internal error: lowering for "${statement.kind}" is not implemented yet (line ${line}) — ` +
          "the parser should not have produced this statement kind yet.",
      );

    default:
      return assertNever(statement, "lowerStatement");
  }
}
