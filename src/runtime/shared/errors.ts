// The runtime error taxonomy (build order step 16) — see DIALECT.md's
// "Runtime error taxonomy" section. `BasicRuntime.reportError` (see
// runtime/interface.ts) is typed against `BasicRuntimeError`, narrowing it
// from a plain `Error` (its build order step 5 placeholder shape).
//
// `SYNTAX` and `UNDEFINED_LINE` are deliberately NOT part of this type:
// both are compile-time-only failures (a `ParseError` and a
// `SemanticError`'s `UNDEFINED_LINE` diagnostic, respectively — see
// semantics/diagnostic.ts) that stop compilation before any code ever
// runs, so the dispatch loop can never actually raise either of them at
// runtime — BASIC has no computed GOTO, so every jump target is fully
// known at compile time.
//
// `BasicRuntimeError` is an interface, not a class with real constructors
// scattered through the codebase: the object satisfying this shape is
// actually built entirely inside *emitted* JS (prelude.ts's
// `__toBasicError`, called from the dispatch loop's top-level catch —
// see emit-program.ts), not by any TS code, since only the emitted
// closure has access to the currently-executing BASIC line number
// (`__line`) a real error needs to carry. This file exists so
// `BasicRuntime` implementations (NodeRuntime, TestRuntime, the future
// BrowserRuntime) and their callers have one shared, documented type to
// program against, structurally satisfied by that emitted-JS-constructed
// object without ever needing an actual `new BasicRuntimeError(...)` call
// anywhere in this codebase's own TS.

export type BasicErrorCode =
  | "TYPE_MISMATCH"
  | "OVERFLOW"
  | "DIVISION_BY_ZERO"
  | "SUBSCRIPT_OUT_OF_RANGE"
  | "OUT_OF_DATA"
  | "RETURN_WITHOUT_GOSUB"
  | "NEXT_WITHOUT_FOR"
  | "ILLEGAL_FUNCTION_CALL"
  /** `OPEN`/`CLOSE`/`PRINT #`/`INPUT #`/`EOF()` failures (GW-BASIC dialect extension — see src/dialect.ts): file not found, wrong mode, reading past end of file, an unopened file number, ... */
  | "FILE_ERROR"
  /** Fallback bucket for a runtime failure that doesn't fit any code above (e.g. RESTORE to a line with no DATA of its own). */
  | "RUNTIME_ERROR";

export interface BasicRuntimeError extends Error {
  readonly code: BasicErrorCode;
  /** The BASIC line number (Line.lineNumber) executing when the error was raised, not a physical source row. */
  readonly line: number;
}
