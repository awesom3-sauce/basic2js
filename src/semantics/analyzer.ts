// Compile-time semantic checks over a Program AST, run after parsing and
// before lowering.
//
// TODO (build order step 16, expanded step 15 for type checks): export
// function analyze(program: Program): Diagnostic[]
// - Validate every GOTO/GOSUB/ON.../IF-line/RESTORE-line target resolves to
//   a real line number (UNDEFINED_LINE as a compile-time diagnostic, since
//   BASIC never computes jump targets dynamically).
// - Flag string/number suffix mismatches (e.g. `A$ = A$ + 5`) using
//   symbol-table.ts wherever the suffix is syntactically known.

export {};
