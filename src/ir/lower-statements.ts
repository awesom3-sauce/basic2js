// Per-statement-kind lowering: Statement -> Step[] fragments.
//
// Implemented: PrintStmt, LetStmt, GotoStmt, RemStmt, EndStmt, StopStmt
// (build order step 3) each lower 1:1 into a single Step; IfStmt (build
// order step 6) lowers into an IfStep plus its branches' recursively
// lowered sub-steps (see lowerIfStmt below). Every other Statement kind is
// handled by an explicit case that throws — the parser doesn't produce
// them yet (unsupported keywords raise a ParseError before lowering ever
// runs), so these branches exist purely as a defensive backstop and,
// together with the final `assertNever`, keep this switch exhaustive:
// adding a new Statement kind without updating this file becomes a
// compile-time TS error. Each one gets a real implementation in its own
// build-order step — see the per-construct rules in CLAUDE.md's
// "dispatch-loop / virtual-PC emitter" section:
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

import type { IfStmt, Statement } from "../ast/statements.js";
import type { JumpTarget, Step } from "./program.js";
import { assertNever } from "../util/assert-never.js";

/**
 * Context threaded through lowering so a statement can compute jump
 * targets relative to where its own Step(s) end up, and know what "the
 * next source line" is (for IF/THEN/ELSE's fall-off-the-end-of-branch
 * semantics — see DIALECT.md).
 */
export interface LoweringContext {
  /** The step index the first Step returned by this call will occupy in the final flat Step[]. */
  readonly stepIndexOffset: number;
  /** The BASIC line number of the next source line, or undefined if this is the last line in the program. */
  readonly nextLineNumber: number | undefined;
}

export function lowerStatement(statement: Statement, line: number, ctx: LoweringContext): Step[] {
  switch (statement.kind) {
    case "PrintStmt":
      return [{ kind: "Print", line, segments: statement.segments }];

    case "LetStmt":
      return [{ kind: "Let", line, target: statement.target, value: statement.value }];

    case "GotoStmt":
      return [{ kind: "Goto", line, target: { kind: "line", line: statement.target } }];

    case "RemStmt":
      return [{ kind: "NoOp", line }];

    case "EndStmt":
    case "StopStmt":
      return [{ kind: "Halt", line }];

    case "IfStmt":
      return lowerIfStmt(statement, line, ctx);

    case "InputStmt":
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

/**
 * Lowers a colon-separated statement list, threading stepIndexOffset
 * through each statement in turn. Used both by lowering.ts (for a whole
 * source line's top-level statements) and by lowerIfStmt (for a THEN/ELSE
 * branch's inline statement list) — same flattening logic either way.
 */
export function lowerStatementList(
  statements: readonly Statement[],
  line: number,
  stepIndexOffset: number,
  nextLineNumber: number | undefined,
): Step[] {
  const steps: Step[] = [];
  let offset = stepIndexOffset;
  for (const statement of statements) {
    const lowered = lowerStatement(statement, line, { stepIndexOffset: offset, nextLineNumber });
    steps.push(...lowered);
    offset += lowered.length;
  }
  return steps;
}

/**
 * Layout in the flat Step[] (relative to the IfStep's own index `i` =
 * ctx.stepIndexOffset):
 *
 *   i:        IfStep(cond, thenTarget, elseTarget)
 *   i+1..k:   then-branch's lowered steps       (only if thenBranch is a Statements branch)
 *   k+1:      unconditional jump to nextLine     (only if BOTH branches are Statements —
 *                                                  otherwise nothing needs skipping over)
 *   ...:      else-branch's lowered steps       (only if elseBranch is a Statements branch)
 *
 * A GotoLine branch contributes no steps of its own — its target is just
 * `{ kind: "line", line }`, identical to how GotoStmt lowers. Falling off
 * the end of a Statements branch (or having an empty one) means "continue
 * to whatever comes right after this IfStmt's own lowered steps" — which,
 * by construction (IfStmt is always the last statement in its top-level
 * statement list per DIALECT.md's THEN/ELSE-extends-to-end-of-line rule),
 * is exactly the next source line. When there's no next line, that's
 * `{ kind: "halt" }` rather than a fabricated out-of-range line number.
 */
function lowerIfStmt(stmt: IfStmt, line: number, ctx: LoweringContext): Step[] {
  const nextLineTarget: JumpTarget =
    ctx.nextLineNumber !== undefined
      ? { kind: "line", line: ctx.nextLineNumber }
      : { kind: "halt" };

  let cursor = ctx.stepIndexOffset + 1; // slot 0 (ctx.stepIndexOffset) is the IfStep itself.

  const thenSteps: Step[] =
    stmt.thenBranch.kind === "Statements"
      ? lowerStatementList(stmt.thenBranch.statements, line, cursor, ctx.nextLineNumber)
      : [];
  const thenTarget: JumpTarget =
    stmt.thenBranch.kind === "GotoLine"
      ? { kind: "line", line: stmt.thenBranch.lineNumber }
      : { kind: "step", index: cursor };
  cursor += thenSteps.length;

  const needsSkipJump =
    stmt.thenBranch.kind === "Statements" && stmt.elseBranch?.kind === "Statements";
  const skipStep: Step[] = needsSkipJump ? [{ kind: "Goto", line, target: nextLineTarget }] : [];
  cursor += skipStep.length;

  let elseTarget: JumpTarget;
  let elseSteps: Step[];
  if (stmt.elseBranch === undefined) {
    elseTarget = nextLineTarget;
    elseSteps = [];
  } else if (stmt.elseBranch.kind === "GotoLine") {
    elseTarget = { kind: "line", line: stmt.elseBranch.lineNumber };
    elseSteps = [];
  } else {
    elseTarget = { kind: "step", index: cursor };
    elseSteps = lowerStatementList(stmt.elseBranch.statements, line, cursor, ctx.nextLineNumber);
  }

  const ifStep: Step = { kind: "If", line, condition: stmt.condition, thenTarget, elseTarget };
  return [ifStep, ...thenSteps, ...skipStep, ...elseSteps];
}
