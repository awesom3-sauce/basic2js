// PRINT output formatting: number-to-string formatting (leading space for
// non-negative numbers, trailing space after — classic BASIC PRINT
// convention), `,` tab-zone alignment (14-column zones), `;` no-separator
// concatenation, TAB(n) and SPC(n), STR$ number formatting.
//
// Scope note (build order step 4 for `;`/`,`/number formatting, step 14 for
// TAB/SPC): same decision as strings.ts/math.ts (see their header
// comments) — all of this is pure and stateless, implemented directly as
// plain JS in src/emitter/prelude.ts (__fmtNum/__tabPad from step 4;
// __tabTo/__spc from step 14) and driven from src/emitter/emit-print.ts,
// rather than duplicated here. See DIALECT.md's PRINT section and Open
// Decisions (the tab-zone/TAB column counter resets every PRINT statement,
// not tracked across statements — a documented simplification) for the
// exact behavior, and emit-program.test.ts's "emit — PRINT" / "emit —
// builtins" tests for behavioral coverage.

export {};
