// Intermediate representation: a flat, statement-granularity Step list plus
// a BASIC-line-number -> step-index map, the input to the emitter. See
// CLAUDE.md's "dispatch-loop / virtual-PC emitter" section.
//
// Scope note (build order step 3, "linear/GOTO-only subset"): Step
// currently has one variant per statement kind the parser supports
// (Print/Let/Goto/NoOp/Halt) — lowering is 1:1 with Statement for all of
// them right now. Control-flow constructs added in later steps (IF,
// FOR/NEXT, GOSUB, WHILE, ON...) will each need their own Step kind(s),
// since their bodies/branches need their own addressable pc slots and
// runtime-stack bookkeeping the source Statement shape doesn't carry —
// unlike the AST/keyword tables, this union is deliberately NOT
// pre-designed for those yet (see lower-statements.ts).

import type { Expression } from "../ast/expressions.js";
import type { LValue, PrintSegment } from "../ast/statements.js";

export type Step = PrintStep | LetStep | GotoStep | NoOpStep | HaltStep;

interface StepBase {
  /** The originating BASIC line number (Line.lineNumber, not a physical source row), for runtime error messages. */
  readonly line: number;
}

export interface PrintStep extends StepBase {
  readonly kind: "Print";
  readonly segments: readonly PrintSegment[];
}

export interface LetStep extends StepBase {
  readonly kind: "Let";
  readonly target: LValue;
  readonly value: Expression;
}

/**
 * `target` is the raw BASIC line number, unresolved. The emitter (build
 * order step 4) resolves it to a step index via `LineIndex` — either at
 * emission time or by emitting a `LINESTART`-style lookup table into the
 * generated JS itself; either way lowering does no resolution of its own,
 * which sidesteps forward-reference ordering entirely (a GOTO to a line
 * that appears later in the source needs no special handling here).
 */
export interface GotoStep extends StepBase {
  readonly kind: "Goto";
  readonly target: number;
}

/** REM/`'` comments: no runtime effect, just falls through to the next step. */
export interface NoOpStep extends StepBase {
  readonly kind: "NoOp";
}

/** END or STOP: halts the dispatch loop (pc = -1). */
export interface HaltStep extends StepBase {
  readonly kind: "Halt";
}

/** Maps each BASIC line number to the index of its first Step in the flat Step[] list. */
export type LineIndex = ReadonlyMap<number, number>;

export interface LoweredProgram {
  readonly steps: readonly Step[];
  readonly lineToStep: LineIndex;
}
