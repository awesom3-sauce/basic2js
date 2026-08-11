// Statement parsing — one parse function per Statement kind, dispatched by
// the leading token in parseStatement().
//
// Implemented (build order step 2, "minimal parser subset"): PRINT, LET
// (explicit `LET` and implicit assignment), GOTO, REM (via the lexer's
// Comment token), END, STOP. Every other keyword the lexer recognizes
// (IF, FOR, GOSUB, ON, WHILE, DIM, DATA, READ, RESTORE, DEF, INPUT — see
// src/lexer/keywords.ts) currently raises a clear "not implemented yet"
// ParseError rather than being silently mis-parsed; each lands in its own
// build-order step (see CLAUDE.md).

import type {
  GotoStmt,
  LetStmt,
  LValue,
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
 * BASIC), EOL, or EOF.
 */
function isStatementEnd(cursor: TokenCursor): boolean {
  return (
    cursor.check("Colon") || cursor.check("Comment") || cursor.check("EOL") || cursor.check("EOF")
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
  const token = cursor.expect("Number");
  const target = numberValue(token);
  if (!Number.isInteger(target) || target < 0) {
    throw new ParseError(
      `GOTO target must be a non-negative integer line number, found "${token.text}"`,
      token.line,
      token.col,
    );
  }
  return { kind: "GotoStmt", target };
}
