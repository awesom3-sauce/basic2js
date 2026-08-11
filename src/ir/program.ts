// Intermediate representation: a flat, statement-granularity Step list plus
// a BASIC-line-number -> step-index map, the input to the emitter. See
// CLAUDE.md's "dispatch-loop / virtual-PC emitter" section.
//
// Step has one variant per statement kind the parser supports so far
// (Print/Let/Goto/If/NoOp/Halt) — control-flow constructs land their own
// Step kind(s) as each build-order step implements them, since their
// bodies/branches need their own addressable pc slots and (for FOR/GOSUB,
// steps 7-8) runtime-stack bookkeeping the source Statement shape doesn't
// carry. Unlike the AST/keyword tables, this union is deliberately NOT
// pre-designed for those yet (see lower-statements.ts).

import type { Expression } from "../ast/expressions.js";
import type { LValue, PrintSegment } from "../ast/statements.js";

export type Step = PrintStep | LetStep | GotoStep | IfStep | NoOpStep | HaltStep;

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
 * Where a jump (GOTO, or an IfStep's then/else branch) resolves to. `line`
 * is left unresolved by lowering — the emitter resolves it to a step index
 * via `LineIndex`, either at emission time or through a `LINESTART`-style
 * lookup table in the generated JS itself; either way lowering does no
 * resolution of its own, which sidesteps forward-reference ordering
 * entirely (a jump to a line that appears later in the source needs no
 * special handling). `step` is a literal step index computed *during*
 * lowering — used for IF/THEN/ELSE's inline statement-list branches, which
 * have no BASIC line number of their own to resolve through `LINESTART`.
 * `halt` means "no next line exists" (an IF on the program's last line
 * whose branch falls off the end with nothing left to fall through to).
 */
export type JumpTarget =
  | { readonly kind: "line"; readonly line: number }
  | { readonly kind: "step"; readonly index: number }
  | { readonly kind: "halt" };

export interface GotoStep extends StepBase {
  readonly kind: "Goto";
  readonly target: JumpTarget;
}

/**
 * A conditional branch: jump to `thenTarget` if `condition` is truthy
 * (BASIC's numeric truthiness — nonzero is true — matches JS's own `if`
 * truthiness for numbers, so the emitter needs no extra coercion), else
 * `elseTarget`. See lower-statements.ts's lowerIfStmt for how THEN/ELSE
 * statement-list branches get flattened into steps immediately following
 * this one.
 */
export interface IfStep extends StepBase {
  readonly kind: "If";
  readonly condition: Expression;
  readonly thenTarget: JumpTarget;
  readonly elseTarget: JumpTarget;
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
