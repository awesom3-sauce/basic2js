// Compile-time semantic checks over a Program AST, run after parsing and
// before lowering (see CLAUDE.md's pipeline diagram). src/index.ts's
// compile() throws a SemanticError (semantic-error.ts) if analyze() returns
// any diagnostics, rather than proceeding to lower/emit code known to
// misbehave.
//
// Two independent checks, one per build order step:
//
// Step 15 ("type-suffix enforcement, compile-time half"): flags every
// statically-knowable string/number suffix mismatch — LET's target vs.
// value, a FOR loop variable's suffix (can't be `$`), a FOR's start/end/
// step, an IF/WHILE's condition, an ON...GOTO/GOSUB's selector, a DIM's
// array-size expressions, and a RANDOMIZE's seed — using
// ast/infer-type.ts's inferExpressionType, which is enough for every check
// here since BASIC's suffix is part of an identifier's own spelling (see
// DIALECT.md) — no symbol table tracking "what was X declared as"
// separately is needed (see symbol-table.ts's header comment for why that
// file stayed a stub). READ/INPUT targets are deliberately NOT checked
// here: READ's source values come from the DATA pool, whose contents at any
// given READ can depend on runtime RESTORE/control-flow, not just source
// order, so a general compile-time correlation isn't feasible; INPUT's
// source is user-typed text, never statically known at all. Both still get
// *runtime* coercion (see emit-read.ts/emit-input.ts).
//
// Step 16 ("undefined-line-target validation"): flags every GOTO/GOSUB/
// ON...GOTO/GOSUB/IF-line-branch/RESTORE-line target that doesn't resolve
// to a real line number in the program — BASIC never computes jump targets
// dynamically (no computed GOTO), so every target is knowable up front by
// simply collecting every Line.lineNumber into a set. This is exactly the
// same category of "structural defect, not a data-dependent bug" WHILE/
// WEND mismatches already get caught as (lowering.ts's resolveWhileWend,
// step 12) — checking it here, at the same compile-time stage as the
// type-suffix work, keeps both a program's compile-time defects surfacing
// together in one SemanticError rather than across two different error
// classes.

import type { Expression } from "../ast/expressions.js";
import { inferExpressionType, type BasicType } from "../ast/infer-type.js";
import type { IfBranch, LValue, Statement } from "../ast/statements.js";
import type { Program } from "../ast/program.js";
import type { Diagnostic } from "./diagnostic.js";
import { assertNever } from "../util/assert-never.js";

export function analyze(program: Program): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const knownLines = new Set(program.lines.map((line) => line.lineNumber));
  for (const line of program.lines) {
    checkStatements(line.statements, line.lineNumber, knownLines, diagnostics);
  }
  return diagnostics;
}

function checkStatements(
  statements: readonly Statement[],
  lineNumber: number,
  knownLines: ReadonlySet<number>,
  diagnostics: Diagnostic[],
): void {
  for (const statement of statements) {
    checkStatement(statement, lineNumber, knownLines, diagnostics);
  }
}

function checkStatement(
  statement: Statement,
  lineNumber: number,
  knownLines: ReadonlySet<number>,
  diagnostics: Diagnostic[],
): void {
  switch (statement.kind) {
    case "LetStmt":
      checkAssignment(statement.target, statement.value, lineNumber, diagnostics);
      break;

    case "ForStmt":
      if (statement.suffix === "$") {
        diagnostics.push(
          typeMismatch(lineNumber, `FOR loop variable "${statement.variable}$" cannot be a string`),
        );
      }
      checkNumeric(statement.start, lineNumber, "a FOR loop's start value", diagnostics);
      checkNumeric(statement.end, lineNumber, "a FOR loop's end value", diagnostics);
      if (statement.step !== undefined) {
        checkNumeric(statement.step, lineNumber, "a FOR loop's STEP value", diagnostics);
      }
      break;

    case "IfStmt":
      checkNumeric(statement.condition, lineNumber, "an IF condition", diagnostics);
      checkIfBranch(statement.thenBranch, lineNumber, knownLines, diagnostics);
      if (statement.elseBranch !== undefined) {
        checkIfBranch(statement.elseBranch, lineNumber, knownLines, diagnostics);
      }
      break;

    case "WhileStmt":
      checkNumeric(statement.condition, lineNumber, "a WHILE condition", diagnostics);
      break;

    case "OnJumpStmt":
      checkNumeric(statement.selector, lineNumber, "an ON...GOTO/GOSUB selector", diagnostics);
      for (const target of statement.targets) {
        checkLineTarget(target, lineNumber, knownLines, diagnostics);
      }
      break;

    case "DimStmt":
      for (const decl of statement.declarations) {
        for (const dim of decl.dimensions) {
          checkNumeric(dim, lineNumber, `a DIM size for "${decl.name}${decl.suffix}"`, diagnostics);
        }
      }
      break;

    case "RandomizeStmt":
      checkNumeric(statement.seed, lineNumber, "a RANDOMIZE seed", diagnostics);
      break;

    case "OpenStmt":
      checkString(statement.path, lineNumber, "an OPEN path", diagnostics);
      checkNumeric(statement.fileNumber, lineNumber, "an OPEN file number", diagnostics);
      break;

    case "CloseStmt":
      for (const fileNumber of statement.fileNumbers) {
        checkNumeric(fileNumber, lineNumber, "a CLOSE file number", diagnostics);
      }
      break;

    case "GotoStmt":
      checkLineTarget(statement.target, lineNumber, knownLines, diagnostics);
      break;

    case "GosubStmt":
      checkLineTarget(statement.target, lineNumber, knownLines, diagnostics);
      break;

    case "RestoreStmt":
      if (statement.target !== undefined) {
        checkLineTarget(statement.target, lineNumber, knownLines, diagnostics);
      }
      break;

    // Nothing to check for the rest of the Statement kinds: ReadStmt/
    // InputStmt are deliberately skipped (see this file's header comment —
    // READ's DATA-pool source types aren't statically correlatable with
    // its targets, INPUT has no static source at all; both still get
    // *runtime* coercion elsewhere), and the remainder are either
    // non-executable, carry no line-number targets, or have no
    // type-suffix-relevant operands.
    case "ReadStmt":
    case "InputStmt":
    case "ReturnStmt":
    case "WendStmt":
    case "NextStmt":
    case "DataStmt":
    case "DefFnStmt":
    case "RemStmt":
    case "EndStmt":
    case "StopStmt":
      break;

    case "PrintStmt":
      // PRINT accepts both types freely for every segment — nothing to check.
      break;

    default:
      assertNever(statement, "checkStatement");
  }
}

function checkIfBranch(
  branch: IfBranch,
  lineNumber: number,
  knownLines: ReadonlySet<number>,
  diagnostics: Diagnostic[],
): void {
  if (branch.kind === "GotoLine") {
    checkLineTarget(branch.lineNumber, lineNumber, knownLines, diagnostics);
  } else {
    checkStatements(branch.statements, lineNumber, knownLines, diagnostics);
  }
}

function checkAssignment(
  target: LValue,
  value: Expression,
  lineNumber: number,
  diagnostics: Diagnostic[],
): void {
  const targetType: BasicType = target.suffix === "$" ? "string" : "number";
  const valueType = inferExpressionType(value);
  if (targetType !== valueType) {
    diagnostics.push(
      typeMismatch(
        lineNumber,
        `cannot assign a ${valueType} value to "${target.name}${target.suffix}" (expects a ${targetType})`,
      ),
    );
  }
}

function checkNumeric(
  expr: Expression,
  lineNumber: number,
  description: string,
  diagnostics: Diagnostic[],
): void {
  if (inferExpressionType(expr) !== "number") {
    diagnostics.push(typeMismatch(lineNumber, `${description} must be numeric, not a string`));
  }
}

function checkString(
  expr: Expression,
  lineNumber: number,
  description: string,
  diagnostics: Diagnostic[],
): void {
  if (inferExpressionType(expr) !== "string") {
    diagnostics.push(typeMismatch(lineNumber, `${description} must be a string, not numeric`));
  }
}

function checkLineTarget(
  target: number,
  lineNumber: number,
  knownLines: ReadonlySet<number>,
  diagnostics: Diagnostic[],
): void {
  if (!knownLines.has(target)) {
    diagnostics.push({
      code: "UNDEFINED_LINE",
      message: `line ${target} does not exist in this program`,
      line: lineNumber,
    });
  }
}

function typeMismatch(line: number, message: string): Diagnostic {
  return { code: "TYPE_MISMATCH", message, line };
}
