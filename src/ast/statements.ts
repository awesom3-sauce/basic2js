// Statement AST node shapes (one variant per BASIC statement kind).
//
// TODO (build order steps 2, 6-13; see the plan file for the full node-shape
// reference — PrintStmt, InputStmt, LetStmt/LValue, IfStmt/IfBranch, ForStmt,
// NextStmt, GotoStmt, GosubStmt, ReturnStmt, OnJumpStmt, WhileStmt, WendStmt,
// DimStmt, DataStmt, ReadStmt, RestoreStmt, DefFnStmt, RemStmt, EndStmt,
// StopStmt). Import Expression from './expressions' and TypeSuffix from
// './types'. Export a `Statement` discriminated union of all of the above.
//
// Remember: IfStmt's THEN/ELSE clause extends to the end of the physical
// line (not just to the next colon) — see DIALECT.md.

export {};
