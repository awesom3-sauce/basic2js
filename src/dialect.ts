// The BASIC dialect a program is compiled against. Threaded through
// exactly one place — the parser (see parser.ts/TokenCursor) — since
// dialect-gating only ever needs to happen at the point a dialect-specific
// keyword is (or isn't) recognized as a statement/expression. Everything
// downstream (semantic analysis, lowering, emission) is dialect-agnostic:
// by construction, a dialect-gated AST node (e.g. `OpenStmt`) can only
// exist at all if the parser already confirmed the right dialect was
// active when it was parsed, so nothing later in the pipeline needs to
// re-check `dialect` itself.
//
// - `"classic"` (the default): the original locked spec — see DIALECT.md.
// - `"gwbasic"`: `"classic"` plus GW-BASIC's sequential file I/O
//   (`OPEN`/`CLOSE`/`PRINT #`/`INPUT #`/`EOF()`) — see DIALECT.md's
//   "GW-BASIC dialect extension" section for exact semantics.
//
// Adding a third dialect later: give it its own literal here, then gate
// whatever's new for it the same way `"gwbasic"`'s extensions are gated —
// grep for `dialect === "gwbasic"` (parser) and `GWBASIC_ONLY_BUILTINS`
// (builtins.ts) to find every existing gating point.

export type Dialect = "classic" | "gwbasic";

export const DEFAULT_DIALECT: Dialect = "classic";
