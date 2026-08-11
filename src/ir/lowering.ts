// Lowering orchestrator: Program (AST) -> LoweredProgram (Step[] + lineToStep).
//
// TODO (build order step 11): add a pre-pass that collects every DataStmt's
// literals (in line order) into one flat DATA array on LoweredProgram,
// recording each entry's originating line for RESTORE <line>. Not needed
// yet — DataStmt isn't parsed until step 11.

import type { Program } from "../ast/program.js";
import type { LoweredProgram, Step } from "./program.js";
import { lowerStatementList } from "./lower-statements.js";

export function lower(program: Program): LoweredProgram {
  const steps: Step[] = [];
  const lineToStep = new Map<number, number>();

  for (let i = 0; i < program.lines.length; i++) {
    // Safe: i < program.lines.length.
    const line = program.lines[i]!;
    const nextLineNumber = program.lines[i + 1]?.lineNumber;

    // Recorded before this line's own steps are pushed, so a line with no
    // statements of its own (e.g. a bare "100") naturally aliases to
    // whatever step comes next — either the next line's first statement,
    // or one-past-the-end (which the emitted dispatch loop's default case
    // treats as halt) if it's the last line in the program. No special
    // case needed for empty lines.
    lineToStep.set(line.lineNumber, steps.length);

    const lowered = lowerStatementList(
      line.statements,
      line.lineNumber,
      steps.length,
      nextLineNumber,
    );
    steps.push(...lowered);
  }

  return { steps, lineToStep };
}
