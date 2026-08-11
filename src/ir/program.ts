// Intermediate representation: a flat, statement-granularity Step list plus
// a BASIC-line-number -> step-index map, the input to the emitter. See
// CLAUDE.md's "dispatch-loop / virtual-PC emitter" section.
//
// Step has one variant per statement kind the parser supports so far
// (Print/Let/Goto/If/For/Next/Gosub/Return/OnJump/NoOp/Halt) —
// control-flow constructs land their own Step kind(s) as each build-order
// step implements them, since their bodies/branches need their own
// addressable pc slots and runtime-stack bookkeeping the source Statement
// shape doesn't carry. Unlike the AST/keyword tables, this union is
// deliberately NOT pre-designed for those yet (see lower-statements.ts).

import type { Expression } from "../ast/expressions.js";
import type { DefFnParam, DimDeclaration, LValue, PrintSegment } from "../ast/statements.js";
import type { BasicValue, TypeSuffix } from "../ast/types.js";

export type Step =
  | PrintStep
  | LetStep
  | GotoStep
  | IfStep
  | ForStep
  | NextStep
  | GosubStep
  | ReturnStep
  | OnJumpStep
  | InputStep
  | DimStep
  | ReadStep
  | RestoreStep
  | WhileStep
  | WendStep
  | NoOpStep
  | HaltStep;

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
 * Placeholder `JumpTarget` for a WhileStep/WendStep's target field at the
 * moment `lower-statements.ts` first produces it — always replaced with a
 * real resolved target by `lowering.ts`'s `resolveWhileWend` before
 * `lower()` returns (see WhileStep). Exported so both files share one
 * definition of "not resolved yet" rather than each hand-rolling a magic
 * index.
 */
export const UNRESOLVED_WHILE_WEND: JumpTarget = { kind: "step", index: -1 };

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

/**
 * Pushes a runtime `forStack` frame and falls through unconditionally into
 * the loop body (classic BASIC's FOR does NOT pre-test the condition —
 * `FOR I = 1 TO 0` still runs the body once; only NEXT checks whether to
 * continue — see DIALECT.md). The body-start pc needs no field here: by
 * construction it's always `stepIndex + 1` (the step immediately
 * following this one), computable at emission time exactly like every
 * other step's normal fallthrough.
 */
export interface ForStep extends StepBase {
  readonly kind: "For";
  readonly variable: string;
  readonly suffix: TypeSuffix;
  readonly start: Expression;
  readonly end: Expression;
  /** Omitted `STEP` defaults to a literal 1. */
  readonly step?: Expression;
}

/**
 * Pops `forStack` frames until finding one matching `variable` (or takes
 * the top frame if `variable` is undefined — a bare `NEXT`), discarding
 * any inner frames popped along the way (GOTO may have abandoned them
 * without a matching NEXT of their own — see DIALECT.md's runtime-stack
 * rationale). An empty stack (or no matching frame) is a `NEXT WITHOUT
 * FOR` runtime error. A multi-variable `NEXT I, J` lowers to two separate
 * NextSteps, one per variable — see lower-statements.ts.
 */
export interface NextStep extends StepBase {
  readonly kind: "Next";
  readonly variable: string | undefined;
}

/**
 * GOSUB: pushes a return address onto a runtime `gosubStack` and jumps to
 * `target`. Like ForStep's body-start, the return address needs no field
 * here — it's always `stepIndex + 1`, computable at emission time.
 */
export interface GosubStep extends StepBase {
  readonly kind: "Gosub";
  readonly target: JumpTarget;
}

/**
 * RETURN: pops `gosubStack` and jumps to the popped address. An empty
 * stack is a `RETURN WITHOUT GOSUB` runtime error.
 */
export interface ReturnStep extends StepBase {
  readonly kind: "Return";
}

/**
 * `ON expr GOTO/GOSUB line1, line2, ...`: truncates `selector` to an
 * integer `n` and jumps to `targets[n-1]` (1-indexed). An out-of-range
 * `n` (< 1 or > targets.length) falls through to the next step with no
 * error — the locked default, see DIALECT.md.
 */
export interface OnJumpStep extends StepBase {
  readonly kind: "OnJump";
  readonly mode: "goto" | "gosub";
  readonly selector: Expression;
  readonly targets: readonly JumpTarget[];
}

/**
 * `INPUT ["prompt"] var[, var...]`: the only Step kind whose emitted case
 * body ever `await`s (besides `rt.print`, always awaited for host
 * symmetry) — suspends the dispatch loop at exactly this point using
 * native JS async machinery. `prompt`/`appendQuestionMark` are resolved
 * to a single fully-computed prompt string at emission time (see
 * emit-input.ts), not carried further as separate runtime concerns.
 */
export interface InputStep extends StepBase {
  readonly kind: "Input";
  readonly prompt?: string;
  readonly appendQuestionMark: boolean;
  readonly targets: readonly LValue[];
}

/**
 * `DIM var(size[, size2]) [, ...]`: (re)allocates each declared array —
 * see emit-statements.ts / prelude.ts's `__arrAlloc`. An array referenced
 * without ever being DIM'd is lazily allocated at default size 10 per
 * dimension on first access instead (classic BASIC behavior — see
 * `__arrEnsure`), so DimStep only ever runs for *explicit* DIMs.
 */
export interface DimStep extends StepBase {
  readonly kind: "Dim";
  readonly declarations: readonly DimDeclaration[];
}

/**
 * `READ var[, var...]`: pulls the next value(s) off the pre-collected
 * `DATA` pool (see `lower(program)`'s pre-pass and emit-read.ts), assigning
 * each in turn. Unlike INPUT, DATA values are already typed (number or
 * string) from parsing — no coercion happens here, just a raw assignment
 * (same as LET; deferred to step 15/16). Running past the end of the pool
 * is an `OUT OF DATA` runtime error.
 */
export interface ReadStep extends StepBase {
  readonly kind: "Read";
  readonly targets: readonly LValue[];
}

/**
 * `RESTORE [line-number]`: resets the runtime `dataPtr` to the start of
 * the `DATA` pool (`target` undefined), or to the first `DATA` value
 * originating from `target`'s line (a runtime error if that line has no
 * `DATA` of its own — see DIALECT.md's Open Decisions).
 */
export interface RestoreStep extends StepBase {
  readonly kind: "Restore";
  readonly target?: number;
}

/**
 * `WHILE cond`: tests `cond` each time control reaches here (both on
 * first entry and after every `WEND` loops back); if truthy, falls
 * through into the loop body (`stepIndex + 1`, needs no field, same
 * reasoning as ForStep); if falsy, jumps to `afterWend`. Unlike FOR/NEXT's
 * runtime `forStack`, WHILE/WEND pairs are matched *statically*, purely at
 * lowering time (`lowering.ts`'s `resolveWhileWend`) — see DIALECT.md for
 * why (WHILE/WEND requires strict lexical nesting; FOR/NEXT does not).
 * `afterWend` starts as an internal placeholder (`UNRESOLVED_WHILE_WEND`)
 * when first lowered from a `WhileStmt` and is always replaced with a real
 * `{ kind: "step" }` target by `resolveWhileWend` before `lower()` ever
 * returns — a mismatched WHILE/WEND is a lowering-time (compile) error,
 * not something that can reach the emitter.
 */
export interface WhileStep extends StepBase {
  readonly kind: "While";
  readonly condition: Expression;
  readonly afterWend: JumpTarget;
}

/** `WEND`: unconditionally jumps back to its matching WhileStep (re-testing the condition). See WhileStep. */
export interface WendStep extends StepBase {
  readonly kind: "Wend";
  readonly whileTarget: JumpTarget;
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
  /**
   * Every `DATA` literal in the program, flattened in source order (a
   * pre-pass over the whole `Program`, since `DATA` is non-executable and
   * doesn't itself become a Step — see `lower(program)`).
   */
  readonly data: readonly BasicValue[];
  /** Maps a BASIC line number to the index into `data` of that line's first DATA value, for `RESTORE <line>`. */
  readonly dataLineStarts: LineIndex;
  /**
   * Every `DEF FN` in the program, keyed by `name + suffix` (matching a
   * `CallExpr.callee` built the same way — see parse-expressions.ts) — a
   * pre-pass over the whole `Program`, since `DEF FN` is non-executable in
   * the sequential sense (defining a function has no runtime effect at the
   * point the `DEF` statement sits) and doesn't itself become a Step.
   */
  readonly fnDefs: ReadonlyMap<string, FnDef>;
}

export interface FnDef {
  readonly params: readonly DefFnParam[];
  readonly body: Expression;
}
