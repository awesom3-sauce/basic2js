// Statement parsing — one parse function per Statement kind, dispatched by
// the leading token in parseStatement().
//
// Implemented: PRINT, LET (explicit `LET` and implicit assignment), GOTO,
// REM (via the lexer's Comment token), END, STOP (build order step 2),
// IF/THEN/ELSE (build order step 6), and FOR/NEXT (build order step 7).
// Every other keyword the lexer recognizes (GOSUB, ON, WHILE, DIM, DATA,
// READ, RESTORE, DEF, INPUT — see src/lexer/keywords.ts) currently raises
// a clear "not implemented yet" ParseError rather than being silently
// mis-parsed; each lands in its own build-order step (see CLAUDE.md).

import type {
  ForStmt,
  GotoStmt,
  IfBranch,
  IfStmt,
  LetStmt,
  LValue,
  NextStmt,
  PrintSegment,
  PrintStmt,
  Statement,
} from "../ast/statements.js";
import { parseExpression } from "./parse-expressions.js";
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
 * Step 2 scope: only bare variable targets (`A`, `A%`, ...). An identifier
 * immediately followed by `(` (an array element target — step 10) isn't
 * recognized here; the leftover `(` will fail the following `expect("=")`
 * with a reasonably clear parse error until array support lands.
 */
function parseLValue(cursor: TokenCursor): LValue {
  const token = cursor.expect("Identifier");
  const { name, suffix } = splitSuffix(stringValue(token));
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
