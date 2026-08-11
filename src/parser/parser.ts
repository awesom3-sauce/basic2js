// Parser orchestrator: Token[] -> Program AST.

import type { Token } from "../lexer/token.js";
import type { Line, Program } from "../ast/program.js";
import type { Statement } from "../ast/statements.js";
import { ParseError } from "./errors.js";
import { TokenCursor } from "./token-cursor.js";
import { parseStatement } from "./parse-statements.js";
import { numberValue } from "./token-value.js";

/**
 * Parses a full tokenized BASIC listing into a `Program`. Each physical
 * line (starting with a `LineNumber` token, per the lexer's contract) is
 * split into colon-separated statements. Lines are returned sorted by
 * line number; duplicate line numbers are a ParseError (classic BASIC
 * listings don't allow them).
 */
export function parse(tokens: readonly Token[]): Program {
  const cursor = new TokenCursor(tokens);
  const lines: Line[] = [];
  const seenLineNumbers = new Set<number>();

  while (!cursor.check("EOF")) {
    const lineNumberToken = cursor.expect("LineNumber");
    const lineNumber = numberValue(lineNumberToken);

    if (seenLineNumbers.has(lineNumber)) {
      throw new ParseError(
        `Duplicate line number ${lineNumber}`,
        lineNumberToken.line,
        lineNumberToken.col,
      );
    }
    seenLineNumbers.add(lineNumber);

    const statements: Statement[] = [];
    // A line containing only a line number (e.g. "100") is valid BASIC and
    // has no statements.
    while (!cursor.check("EOL") && !cursor.check("EOF")) {
      statements.push(parseStatement(cursor));
      // A trailing REM/' comment needs no preceding colon to continue the
      // line (e.g. "10 X=1 'note"): it's re-entered as its own statement
      // next iteration, parseStatement recognizes the Comment token
      // directly, and the line then naturally ends (comments always
      // consume to end of line in the lexer).
      if (cursor.check("Comment")) continue;
      if (cursor.match("Colon")) continue;
      break;
    }

    cursor.match("EOL");
    lines.push({ kind: "Line", lineNumber, statements, source: "" });
  }

  const sortedLines = [...lines].sort((a, b) => a.lineNumber - b.lineNumber);
  return { kind: "Program", lines: sortedLines };
}
