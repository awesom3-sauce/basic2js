// Statement AST node shapes (one variant per BASIC statement kind).
//
// Every switch over `Statement['kind']` elsewhere in the codebase must end
// in a `default: return assertNever(node);` case — see
// src/util/assert-never.ts and CLAUDE.md's exhaustiveness convention.
//
// Parser support status (build order step 2, "minimal parser subset"):
// PrintStmt, LetStmt (explicit `LET` and implicit assignment), GotoStmt,
// RemStmt, EndStmt, and StopStmt are implemented — see
// src/parser/parse-statements.ts. Every other variant below is defined now
// as a type only (cheap, and gives later steps — 6 through 13 — a stable
// shape to parse into) with no parser support yet; parsing an unsupported
// statement keyword currently raises a clear "not implemented yet"
// ParseError rather than silently mis-parsing.

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
}

export type PrintSegment =
  | { readonly kind: "value"; readonly expr: Expression }
  | { readonly kind: "sep"; readonly sep: ";" | "," };

// --- INPUT (step 9) ---

export interface InputStmt {
  readonly kind: "InputStmt";
  readonly prompt?: string;
  readonly appendQuestionMark: boolean;
  readonly targets: readonly LValue[];
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
