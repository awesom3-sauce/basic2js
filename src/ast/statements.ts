// Statement AST node shapes (one variant per BASIC statement kind).
//
// Every switch over `Statement['kind']` elsewhere in the codebase must end
// in a `default: return assertNever(node);` case — see
// src/util/assert-never.ts and CLAUDE.md's exhaustiveness convention.
//
// Parser support status: every variant below has real parser support as of
// build order step 14 — see src/parser/parse-statements.ts's header comment
// for the step each landed in. `RandomizeStmt` (step 14) was the last one
// added.

import type { Expression } from "./expressions.js";
import type { TypeSuffix } from "./types.js";

export type Statement =
  | PrintStmt
  | InputStmt
  | LetStmt
  | IfStmt
  | ForStmt
  | NextStmt
  | GotoStmt
  | GosubStmt
  | ReturnStmt
  | OnJumpStmt
  | WhileStmt
  | WendStmt
  | DimStmt
  | DataStmt
  | ReadStmt
  | RestoreStmt
  | DefFnStmt
  | RandomizeStmt
  | OpenStmt
  | CloseStmt
  | RemStmt
  | EndStmt
  | StopStmt;

// --- Assignment targets, shared by LET/INPUT/READ ---

export type LValue = VariableLValue | ArrayElementLValue;

export interface VariableLValue {
  readonly kind: "Variable";
  readonly name: string;
  readonly suffix: TypeSuffix;
}

/** Step 10+ (DIM/arrays) — not produced by the parser yet. */
export interface ArrayElementLValue {
  readonly kind: "ArrayElement";
  readonly name: string;
  readonly suffix: TypeSuffix;
  readonly indices: readonly Expression[];
}

// --- PRINT ---

export interface PrintStmt {
  readonly kind: "PrintStmt";
  readonly segments: readonly PrintSegment[];
  /** `PRINT #n, ...` (GW-BASIC dialect extension — see src/dialect.ts). `undefined` means the console, same as always. */
  readonly fileNumber?: Expression;
}

export type PrintSegment =
  | { readonly kind: "value"; readonly expr: Expression }
  | { readonly kind: "sep"; readonly sep: ";" | "," }
  /**
   * `TAB(col)` — pads with spaces so the next segment starts at column
   * `col` (1-indexed), or contributes nothing if already at/past that
   * column (build order step 14). Recognized only in PRINT's segment
   * list, not as a general expression — matches real classic BASIC, which
   * restricts TAB/SPC to PRINT argument position. See parsePrintStmt.
   */
  | { readonly kind: "tab"; readonly expr: Expression }
  /** `SPC(n)` — always contributes exactly `n` literal spaces (build order step 14). */
  | { readonly kind: "spc"; readonly expr: Expression };

// --- INPUT (step 9) ---

export interface InputStmt {
  readonly kind: "InputStmt";
  readonly prompt?: string;
  readonly appendQuestionMark: boolean;
  readonly targets: readonly LValue[];
  /** `INPUT #n, ...` (GW-BASIC dialect extension — see src/dialect.ts). `undefined` means interactive console input, same as always. Mutually exclusive with `prompt`/`appendQuestionMark` — the file form never has a prompt. */
  readonly fileNumber?: Expression;
}

// --- LET ---

export interface LetStmt {
  readonly kind: "LetStmt";
  readonly target: LValue;
  readonly value: Expression;
  /** `false` for implicit assignment (`A = 5` without the `LET` keyword). */
  readonly explicitLet: boolean;
}

// --- IF/THEN/ELSE (step 6) ---

export interface IfStmt {
  readonly kind: "IfStmt";
  readonly condition: Expression;
  readonly thenBranch: IfBranch;
  readonly elseBranch?: IfBranch;
}

/**
 * The THEN/ELSE clause's statement list extends to the end of the physical
 * line — it is NOT terminated by the next colon the way top-level
 * statements are. See DIALECT.md.
 */
export type IfBranch =
  | { readonly kind: "GotoLine"; readonly lineNumber: number }
  | { readonly kind: "Statements"; readonly statements: readonly Statement[] };

// --- FOR/NEXT (step 7) ---

export interface ForStmt {
  readonly kind: "ForStmt";
  readonly variable: string;
  readonly suffix: TypeSuffix;
  readonly start: Expression;
  readonly end: Expression;
  readonly step?: Expression;
}

export interface NextStmt {
  readonly kind: "NextStmt";
  /** Empty = bare `NEXT`, matching the innermost open FOR. */
  readonly variables: readonly string[];
}

// --- GOTO/GOSUB/RETURN/ON (GOTO is step 2; GOSUB/RETURN/ON are step 8) ---

export interface GotoStmt {
  readonly kind: "GotoStmt";
  readonly target: number;
}

export interface GosubStmt {
  readonly kind: "GosubStmt";
  readonly target: number;
}

export interface ReturnStmt {
  readonly kind: "ReturnStmt";
}

export interface OnJumpStmt {
  readonly kind: "OnJumpStmt";
  readonly mode: "goto" | "gosub";
  readonly selector: Expression;
  readonly targets: readonly number[];
}

// --- WHILE/WEND (step 12) ---

export interface WhileStmt {
  readonly kind: "WhileStmt";
  readonly condition: Expression;
}

export interface WendStmt {
  readonly kind: "WendStmt";
}

// --- DIM (step 10) ---

export interface DimStmt {
  readonly kind: "DimStmt";
  readonly declarations: readonly DimDeclaration[];
}

export interface DimDeclaration {
  readonly name: string;
  readonly suffix: TypeSuffix;
  readonly dimensions: readonly Expression[];
}

// --- DATA/READ/RESTORE (step 11) ---

export interface DataStmt {
  readonly kind: "DataStmt";
  readonly values: readonly DataValue[];
}

export type DataValue =
  { readonly t: "num"; readonly v: number } | { readonly t: "str"; readonly v: string };

export interface ReadStmt {
  readonly kind: "ReadStmt";
  readonly targets: readonly LValue[];
}

export interface RestoreStmt {
  readonly kind: "RestoreStmt";
  readonly target?: number;
}

// --- DEF FN (step 13) ---

export interface DefFnStmt {
  readonly kind: "DefFnStmt";
  readonly name: string;
  readonly suffix: TypeSuffix;
  readonly params: readonly DefFnParam[];
  readonly body: Expression;
}

export interface DefFnParam {
  readonly name: string;
  readonly suffix: TypeSuffix;
}

// --- RANDOMIZE (step 14) ---

/**
 * `RANDOMIZE seed` — reseeds the runtime's PRNG so subsequent `RND` calls
 * are deterministic (see src/runtime/shared/random.ts). Unlike real
 * GW-BASIC, `seed` is required in v1 — a bare `RANDOMIZE` with no argument
 * (which prompts "Random Number Seed" interactively on real hardware)
 * isn't supported, since this compiler targets non-interactive/scripted
 * execution first. See DIALECT.md's Open Decisions.
 */
export interface RandomizeStmt {
  readonly kind: "RandomizeStmt";
  readonly seed: Expression;
}

// --- GW-BASIC dialect extension: sequential file I/O — see src/dialect.ts ---

/**
 * `OPEN path FOR mode AS #fileNumber`. `mode` is one of `INPUT` (read),
 * `OUTPUT` (write, truncating any existing file), or `APPEND` (write,
 * preserving existing content) — real GW-BASIC's `RANDOM`/binary mode
 * isn't supported (see DIALECT.md). The `#` before `fileNumber` is
 * optional, matching real GW-BASIC (`AS #1` and `AS 1` are both legal).
 */
export interface OpenStmt {
  readonly kind: "OpenStmt";
  readonly path: Expression;
  readonly mode: "input" | "output" | "append";
  readonly fileNumber: Expression;
}

/**
 * `CLOSE [#n [, #n...]]`. An empty `fileNumbers` list (a bare `CLOSE`)
 * closes every currently-open file, matching real GW-BASIC. Each `#` is
 * optional, same as `OPEN`'s `AS #n`.
 */
export interface CloseStmt {
  readonly kind: "CloseStmt";
  readonly fileNumbers: readonly Expression[];
}

// --- Misc ---

export interface RemStmt {
  readonly kind: "RemStmt";
  readonly text: string;
}

export interface EndStmt {
  readonly kind: "EndStmt";
}

export interface StopStmt {
  readonly kind: "StopStmt";
}
