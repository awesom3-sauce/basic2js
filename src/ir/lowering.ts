// Lowering orchestrator: Program (AST) -> LoweredProgram (Step[] + lineToStep + DATA pool).

import type { Line, Program } from "../ast/program.js";
import type { Statement } from "../ast/statements.js";
import type { BasicValue } from "../ast/types.js";
import type { LoweredProgram, Step } from "./program.js";
import { lowerStatementList } from "./lower-statements.js";

export function lower(program: Program): LoweredProgram {
  const { data, dataLineStarts } = collectData(program);

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

  return { steps, lineToStep, data, dataLineStarts };
}

/**
 * Flattens every `DATA` literal in the program into one pool, in source
 * order — `DATA` is non-executable (see lower-statements.ts's `DataStmt`
 * case, which produces zero Steps), so this is the only place its values
 * are ever collected. Recurses into `IfStmt` branches too (a `DATA`
 * statement nested inside a `THEN`/`ELSE` clause is unusual but not
 * disallowed by the grammar), not just each line's top-level statements.
 */
function collectData(program: Program): {
  data: BasicValue[];
  dataLineStarts: Map<number, number>;
} {
  const data: BasicValue[] = [];
  const dataLineStarts = new Map<number, number>();

  const visitLine = (line: Line): void => visitStatements(line.statements, line.lineNumber);

  const visitStatements = (statements: readonly Statement[], lineNumber: number): void => {
    for (const statement of statements) {
      if (statement.kind === "DataStmt") {
        // Only the *first* DATA statement on a given line sets that
        // line's recorded start — later ones on the same line just keep
        // appending, still correctly reachable by walking forward from it.
        if (!dataLineStarts.has(lineNumber)) {
          dataLineStarts.set(lineNumber, data.length);
        }
        for (const value of statement.values) data.push(value.v);
      } else if (statement.kind === "IfStmt") {
        if (statement.thenBranch.kind === "Statements") {
          visitStatements(statement.thenBranch.statements, lineNumber);
        }
        if (statement.elseBranch?.kind === "Statements") {
          visitStatements(statement.elseBranch.statements, lineNumber);
        }
      }
    }
  };

  for (const line of program.lines) visitLine(line);
  return { data, dataLineStarts };
}
