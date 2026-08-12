// A compile-time finding from the semantic analyzer (analyzer.ts), run
// after parsing and before lowering — see CLAUDE.md's pipeline diagram.
//
// Only one code exists as of build order step 15 (`TYPE_MISMATCH`);
// `UNDEFINED_LINE` joins it in step 16, once GOTO/GOSUB/ON.../IF-line/
// RESTORE-line target validation lands (see analyzer.ts's header comment).

export type DiagnosticCode = "TYPE_MISMATCH";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly message: string;
  /** The originating BASIC line number (Line.lineNumber), not a physical source row. */
  readonly line: number;
}
