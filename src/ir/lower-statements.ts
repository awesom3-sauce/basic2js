// Per-statement-kind lowering: Statement -> Step[] fragments.
//
// TODO (build order step 3, expanded through steps 6-13 — see the plan
// file's "Dispatch-Loop / Virtual-PC Execution Model" section for the exact
// per-construct rules): one lowering function per Statement kind. Notably:
// - IfStmt: recursively lower THEN/ELSE clause statements into their own
//   steps; falling off the end always jumps to the start of the *next
//   source line*, not the next colon-statement.
// - ForStmt/NextStmt: runtime forStack frames (GOTO can jump into/out of
//   loop bodies, so pairing must be dynamic, not static).
// - WhileStmt/WendStmt: purely static bracket-matching at lowering time.
// - GosubStmt/ReturnStmt: runtime gosubStack of return step-indices.
// - OnJumpStmt: out-of-range selector falls through with no error (locked
//   default, see DIALECT.md).
// - DataStmt: collected in a separate pre-pass (see lowering.ts), not
//   lowered to a step itself (DATA is non-executable).

export {};
