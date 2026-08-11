// Lowering orchestrator: Program (AST) -> { steps: Step[], lineToStep, data }.
//
// TODO (build order step 3): export function lower(program: Program): LoweredProgram
// - Pre-pass: collect every DataStmt's literals (in line order) into one flat
//   DATA array, recording each entry's originating line for RESTORE <line>.
// - Walk lines/statements in order, delegating to lower-statements.ts,
//   accumulating a flat Step[] and building lineToStep as the first step
//   index of each source line.

export {};
