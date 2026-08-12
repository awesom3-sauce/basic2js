// A compile-time finding from the semantic analyzer (analyzer.ts), run
// after parsing and before lowering — see CLAUDE.md's pipeline diagram.
//
// `TYPE_MISMATCH` (build order step 15) and `UNDEFINED_LINE` (build order
// step 16, for a GOTO/GOSUB/ON.../IF-line/RESTORE-line target that doesn't
// resolve to a real line number) are both compile-time-only diagnostic
// codes — contrast `src/runtime/shared/errors.ts`'s `BasicErrorCode`,
// which covers *runtime* errors instead (`TYPE_MISMATCH` also has a
// runtime-reachable counterpart there, for the one assignment site — READ —
// that isn't statically checkable; `UNDEFINED_LINE` never does, since
// every jump target is fully known at compile time — no computed GOTO).

export type DiagnosticCode = "TYPE_MISMATCH" | "UNDEFINED_LINE";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly message: string;
  /** The originating BASIC line number (Line.lineNumber), not a physical source row. */
  readonly line: number;
}
