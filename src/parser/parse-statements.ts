// Statement parsing — one parse function per Statement kind, dispatched by
// the leading token in parseStatement().
//
// Implemented: PRINT, LET (explicit `LET` and implicit assignment), GOTO,
// REM (via the lexer's Comment token), END, STOP (build order step 2),
// IF/THEN/ELSE (build order step 6), FOR/NEXT (build order step 7),
// GOSUB/RETURN/ON...GOTO/ON...GOSUB (build order step 8), INPUT (build
// order step 9), DIM/array l-values (build order step 10),
// DATA/READ/RESTORE (build order step 11), and WHILE/WEND (build order
// step 12). Every other keyword the lexer recognizes (DEF — see
// src/lexer/keywords.ts) currently raises a clear "not implemented yet"
// ParseError rather than being silently mis-parsed; each lands in its own
// build-order step (see CLAUDE.md).

import type {
  DataStmt,
  DataValue,
  DimDeclaration,
  DimStmt,
  ForStmt,
  GosubStmt,
  GotoStmt,
  IfBranch,
  IfStmt,
  InputStmt,
  LetStmt,
  LValue,
  NextStmt,
  OnJumpStmt,
  PrintSegment,
  PrintStmt,
  ReadStmt,
  RestoreStmt,
  Statement,
  WhileStmt,
} from "../ast/statements.js";
import { parseExpression, parseIndexList } from "./parse-expressions.js";
import { splitSuffix } from "./identifier.js";
import { numberValue, stringValue } from "./token-value.js";
import { ParseError } from "./errors.js";
import type { TokenCursor } from "./token-cursor.js";

/**
 * True when the cursor is at a token that ends the current statement:
 * colon, a trailing comment (REM/' need no preceding colon in classic
 * BASIC), a bare ELSE (an IF/THEN branch's statement list stops here — see
 * parseIfBranch — and ELSE can never legitimately appear mid-statement
 * anywhere else either), EOL, or EOF.
 */
function isStatementEnd(cursor: TokenCursor): boolean {
  return (
    cursor.check("Colon") ||
    cursor.check("Comment") ||
    cursor.check("Keyword", "ELSE") ||
    cursor.check("EOL") ||
    cursor.check("EOF")
  );
}

export function parseStatement(cursor: TokenCursor): Statement {
  const token = cursor.current();

  if (token.type === "Comment") {
    cursor.advance();
    return { kind: "RemStmt", text: stringValue(token) };
  }

  if (token.type === "Identifier") {
    return parseLetStmt(cursor, { explicit: false });
  }

  if (token.type === "Keyword") {
    switch (token.text) {
      case "PRINT":
        return parsePrintStmt(cursor);
      case "LET":
        return parseLetStmt(cursor, { explicit: true });
      case "GOTO":
        return parseGotoStmt(cursor);
      case "IF":
        return parseIfStmt(cursor);
      case "FOR":
        return parseForStmt(cursor);
      case "NEXT":
        return parseNextStmt(cursor);
      case "GOSUB":
        return parseGosubStmt(cursor);
      case "RETURN":
        cursor.advance();
        return { kind: "ReturnStmt" };
      case "ON":
        return parseOnJumpStmt(cursor);
      case "INPUT":
        return parseInputStmt(cursor);
      case "DIM":
        return parseDimStmt(cursor);
      case "DATA":
        return parseDataStmt(cursor);
      case "READ":
        return parseReadStmt(cursor);
      case "RESTORE":
        return parseRestoreStmt(cursor);
      case "WHILE":
        return parseWhileStmt(cursor);
      case "WEND":
        cursor.advance();
        return { kind: "WendStmt" };
      case "END":
        cursor.advance();
        return { kind: "EndStmt" };
      case "STOP":
        cursor.advance();
        return { kind: "StopStmt" };
      default:
        throw new ParseError(
          `"${token.text}" statements are not implemented yet (see CLAUDE.md's staged build order)`,
          token.line,
          token.col,
        );
    }
  }

  throw new ParseError(
    `Expected a statement, found ${token.type === "EOL" || token.type === "EOF" ? "end of line" : `"${token.text}"`}`,
    token.line,
    token.col,
  );
}

function parsePrintStmt(cursor: TokenCursor): PrintStmt {
  cursor.expect("Keyword", "PRINT");
  const segments: PrintSegment[] = [];
  // Two "value" segments may never sit adjacent without a separator
  // between them — `PRINT 1 2` is invalid syntax, not two implicitly
  // adjacent values.
  let atValueBoundary = false;

  while (!isStatementEnd(cursor)) {
    if (cursor.check("Operator", ";") || cursor.check("Operator", ",")) {
      const sep = cursor.advance().text as ";" | ",";
      segments.push({ kind: "sep", sep });
      atValueBoundary = false;
      continue;
    }

    if (atValueBoundary) {
      const token = cursor.current();
      throw new ParseError(
        `Expected ";" or "," between PRINT values, found "${token.text}"`,
        token.line,
        token.col,
      );
    }

    segments.push({ kind: "value", expr: parseExpression(cursor) });
    atValueBoundary = true;
  }

  return { kind: "PrintStmt", segments };
}

function parseLetStmt(cursor: TokenCursor, options: { explicit: boolean }): LetStmt {
  if (options.explicit) cursor.expect("Keyword", "LET");
  const target = parseLValue(cursor);
  cursor.expect("Operator", "=");
  const value = parseExpression(cursor);
  return { kind: "LetStmt", target, value, explicitLet: options.explicit };
}

/**
 * A bare variable (`A`, `A%`, ...) or, if immediately followed by `(`, an
 * array element (`A(I)`, `A(I, J)`, ...).
 */
function parseLValue(cursor: TokenCursor): LValue {
  const token = cursor.expect("Identifier");
  const { name, suffix } = splitSuffix(stringValue(token));
  if (cursor.check("Operator", "(")) {
    return { kind: "ArrayElement", name, suffix, indices: parseIndexList(cursor) };
  }
  return { kind: "Variable", name, suffix };
}

function parseGotoStmt(cursor: TokenCursor): GotoStmt {
  cursor.expect("Keyword", "GOTO");
  return { kind: "GotoStmt", target: parseLineNumberTarget(cursor, "GOTO") };
}

/**
 * `IF cond THEN <line-number | statement-list> [ELSE <line-number | statement-list>]`.
 * See DIALECT.md: the THEN/ELSE clause's statement list extends to the end
 * of the physical line, not just to the next colon — parseIfBranch's
 * statement loop stops only at ELSE/EOL/EOF, never breaking out just
 * because a top-level statement boundary "would" be there.
 */
function parseIfStmt(cursor: TokenCursor): IfStmt {
  cursor.expect("Keyword", "IF");
  const condition = parseExpression(cursor);
  cursor.expect("Keyword", "THEN");
  const thenBranch = parseIfBranch(cursor);
  const elseBranch = cursor.match("Keyword", "ELSE") ? parseIfBranch(cursor) : undefined;
  return { kind: "IfStmt", condition, thenBranch, elseBranch };
}

function parseIfBranch(cursor: TokenCursor): IfBranch {
  if (cursor.check("Number")) {
    return { kind: "GotoLine", lineNumber: parseLineNumberTarget(cursor, "IF/THEN") };
  }

  const statements: Statement[] = [];
  while (!cursor.check("Keyword", "ELSE") && !cursor.check("EOL") && !cursor.check("EOF")) {
    statements.push(parseStatement(cursor));
    // Same continuation rule as the top-level line loop in parser.ts: a
    // trailing comment needs no colon, and stops the branch on its own
    // (comments always consume to end of line in the lexer); anything else
    // needs an explicit colon to continue the branch's statement list.
    if (cursor.check("Comment")) continue;
    if (cursor.match("Colon")) continue;
    break;
  }
  return { kind: "Statements", statements };
}

/** `FOR var = start TO end [STEP step]`. */
function parseForStmt(cursor: TokenCursor): ForStmt {
  cursor.expect("Keyword", "FOR");
  const varToken = cursor.expect("Identifier");
  const { name, suffix } = splitSuffix(stringValue(varToken));
  cursor.expect("Operator", "=");
  const start = parseExpression(cursor);
  cursor.expect("Keyword", "TO");
  const end = parseExpression(cursor);
  const step = cursor.match("Keyword", "STEP") ? parseExpression(cursor) : undefined;
  return { kind: "ForStmt", variable: name, suffix, start, end, step };
}

/**
 * `NEXT [var[, var...]]`. A bare `NEXT` matches the innermost open `FOR`
 * (see lowerStatement's handling of an empty `variables` list). A
 * multi-variable `NEXT I, J` is treated as shorthand for separate
 * consecutive `NEXT I` / `NEXT J` statements — see DIALECT.md.
 */
function parseNextStmt(cursor: TokenCursor): NextStmt {
  cursor.expect("Keyword", "NEXT");
  const variables: string[] = [];
  if (!isStatementEnd(cursor)) {
    for (;;) {
      const token = cursor.expect("Identifier");
      variables.push(splitSuffix(stringValue(token)).name);
      if (!cursor.match("Operator", ",")) break;
    }
  }
  return { kind: "NextStmt", variables };
}

function parseGosubStmt(cursor: TokenCursor): GosubStmt {
  cursor.expect("Keyword", "GOSUB");
  return { kind: "GosubStmt", target: parseLineNumberTarget(cursor, "GOSUB") };
}

/** `ON expr GOTO line1, line2, ...` / `ON expr GOSUB line1, line2, ...`. */
function parseOnJumpStmt(cursor: TokenCursor): OnJumpStmt {
  cursor.expect("Keyword", "ON");
  const selector = parseExpression(cursor);

  let mode: "goto" | "gosub";
  if (cursor.match("Keyword", "GOTO")) {
    mode = "goto";
  } else if (cursor.match("Keyword", "GOSUB")) {
    mode = "gosub";
  } else {
    const token = cursor.current();
    throw new ParseError(
      `Expected "GOTO" or "GOSUB" after "ON <expr>", found "${token.text}"`,
      token.line,
      token.col,
    );
  }

  const targets: number[] = [];
  for (;;) {
    targets.push(parseLineNumberTarget(cursor, "ON"));
    if (!cursor.match("Operator", ",")) break;
  }
  return { kind: "OnJumpStmt", mode, selector, targets };
}

/**
 * `INPUT ["prompt"(";"|",")] var[, var...]`. A prompt followed by `;`
 * appends a trailing `? ` (GW-BASIC's default); followed by `,` suppresses
 * it, leaving just the prompt text. No prompt at all still shows a bare
 * `? `. See DIALECT.md — the leading `INPUT;` newline-suppression form
 * (distinct from the prompt's own `;`/`,`) isn't supported.
 */
function parseInputStmt(cursor: TokenCursor): InputStmt {
  cursor.expect("Keyword", "INPUT");

  let prompt: string | undefined;
  let appendQuestionMark = true;
  if (cursor.check("String")) {
    prompt = stringValue(cursor.advance());
    appendQuestionMark = !cursor.match("Operator", ",");
    if (appendQuestionMark) cursor.expect("Operator", ";");
  }

  const targets: LValue[] = [];
  for (;;) {
    targets.push(parseLValue(cursor));
    if (!cursor.match("Operator", ",")) break;
  }

  return { kind: "InputStmt", prompt, appendQuestionMark, targets };
}

/**
 * `DIM var(size[, size2]) [, var2(...)...]`. An identifier's dimension
 * count here isn't restricted to 1 or 2 by the parser — DIALECT.md's "1D
 * and 2D only" is a documented v1 scope decision enforced (if at all) at
 * the runtime array-allocation helper, not a parse-time restriction.
 */
function parseDimStmt(cursor: TokenCursor): DimStmt {
  cursor.expect("Keyword", "DIM");
  const declarations: DimDeclaration[] = [];
  for (;;) {
    const token = cursor.expect("Identifier");
    const { name, suffix } = splitSuffix(stringValue(token));
    const dimensions = parseIndexList(cursor);
    declarations.push({ name, suffix, dimensions });
    if (!cursor.match("Operator", ",")) break;
  }
  return { kind: "DimStmt", declarations };
}

/**
 * `DATA value, value, ...`. Scope decision (see DIALECT.md): only
 * (optionally negative) numeric literals and *quoted* string literals are
 * supported — real BASIC also allows unquoted bare-word string data
 * (`DATA JOHN, 25`), but our lexer already normalizes identifier-shaped
 * tokens to lowercase (it doesn't know, at lex time, that a DATA value
 * isn't meant to be case-insensitive), which would silently corrupt
 * unquoted string data. Quoted strings sidestep that entirely.
 */
function parseDataStmt(cursor: TokenCursor): DataStmt {
  cursor.expect("Keyword", "DATA");
  const values: DataValue[] = [];
  for (;;) {
    values.push(parseDataValue(cursor));
    if (!cursor.match("Operator", ",")) break;
  }
  return { kind: "DataStmt", values };
}

function parseDataValue(cursor: TokenCursor): DataValue {
  const negative = cursor.match("Operator", "-");

  if (cursor.check("Number")) {
    const n = numberValue(cursor.advance());
    return { t: "num", v: negative ? -n : n };
  }
  if (!negative && cursor.check("String")) {
    return { t: "str", v: stringValue(cursor.advance()) };
  }

  const token = cursor.current();
  throw new ParseError(
    `Expected a DATA value (a number or a quoted string), found "${token.text}"`,
    token.line,
    token.col,
  );
}

function parseReadStmt(cursor: TokenCursor): ReadStmt {
  cursor.expect("Keyword", "READ");
  const targets: LValue[] = [];
  for (;;) {
    targets.push(parseLValue(cursor));
    if (!cursor.match("Operator", ",")) break;
  }
  return { kind: "ReadStmt", targets };
}

function parseRestoreStmt(cursor: TokenCursor): RestoreStmt {
  cursor.expect("Keyword", "RESTORE");
  const target = cursor.check("Number") ? parseLineNumberTarget(cursor, "RESTORE") : undefined;
  return { kind: "RestoreStmt", target };
}

function parseLineNumberTarget(cursor: TokenCursor, context: string): number {
  const token = cursor.expect("Number");
  const target = numberValue(token);
  if (!Number.isInteger(target) || target < 0) {
    throw new ParseError(
      `${context} target must be a non-negative integer line number, found "${token.text}"`,
      token.line,
      token.col,
    );
  }
  return target;
}

/**
 * `WHILE cond`. Note: unlike `IF`/`FOR`, `WHILE`'s loop body is NOT
 * collected here — WHILE/WEND are ordinary standalone statements in the
 * AST (matching bracket structure entirely absent from the grammar
 * itself); the matching `WEND` is found later, at lowering time, via
 * static bracket-matching over the flattened Step[] (see
 * lower-statements.ts / lowering.ts) — the same reason a mismatched
 * WHILE/WEND pair is caught at lowering, not here at parse time.
 */
function parseWhileStmt(cursor: TokenCursor): WhileStmt {
  cursor.expect("Keyword", "WHILE");
  const condition = parseExpression(cursor);
  return { kind: "WhileStmt", condition };
}
