// BASIC source -> Token[] lexer.
//
// Scope note (build order step 1 — "minimal lexer"): the keyword table and
// operator set are already dialect-complete (see keywords.ts), since a
// lookup table costs nothing extra to fill in up front. What's genuinely
// deferred to later steps is everything *downstream* of tokenizing — the
// parser only implements statement/expression grammar for PRINT, LET,
// GOTO, arithmetic, literals, and colon-separated statements for now; later
// build-order steps teach it to consume the IF/FOR/GOSUB/... keyword and
// comparison-operator tokens this lexer already produces.
//
// Known deferred edge case (build order step 13, DEF FN): classic BASIC
// often writes a user function's name as "FNA" (FN concatenated directly
// onto the name, no space) at both the DEF and call sites. This lexer's
// greedy identifier scan tokenizes "FNA" as a single Identifier ("fna"),
// not as the Keyword "FN" followed by Identifier "a". Resolving that will
// need parser-level context (or lexer state) when DEF FN is implemented —
// not addressed here.

import { LexError } from "./lex-error.js";
import { lookupKeyword } from "./keywords.js";
import type { Token } from "./token.js";

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function isAlpha(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

function isAlphaNumeric(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch);
}

function isSuffix(ch: string): boolean {
  return ch === "%" || ch === "!" || ch === "#" || ch === "$";
}

// "#" pulls double duty: inside the identifier-scanning branch below it's
// consumed as a type suffix (e.g. "A#"), checked *before* this table is
// ever consulted for that position — so a standalone "#" only ever reaches
// here (and becomes an Operator token) when it's NOT immediately preceded
// by an identifier, e.g. GW-BASIC dialect file I/O's `PRINT #1`/`CLOSE #1`
// (see src/dialect.ts). The lexer stays dialect-agnostic either way: it
// always tokenizes "#", the parser is what decides whether that's legal
// for the active dialect.
const SINGLE_CHAR_OPERATORS = "+-*/\\^=<>,;()#";

/**
 * Tokenizes a full BASIC source listing. Every non-blank physical line must
 * begin (after leading whitespace) with a line number; blank lines are
 * silently skipped. Throws `LexError` on malformed input.
 */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const physicalLines = source.split(/\r\n|\r|\n/);

  for (let lineIndex = 0; lineIndex < physicalLines.length; lineIndex++) {
    const rawLine = physicalLines[lineIndex] ?? "";
    const sourceLine = lineIndex + 1;
    let pos = 0;

    const col = (): number => pos + 1;
    const skipSpaces = (): void => {
      while (rawLine.charAt(pos) === " " || rawLine.charAt(pos) === "\t") pos++;
    };

    skipSpaces();
    if (pos >= rawLine.length) {
      continue; // Blank line: no tokens at all, not even EOL.
    }

    if (!isDigit(rawLine.charAt(pos))) {
      throw new LexError(
        `Expected a line number at the start of the line, found "${rawLine.charAt(pos)}"`,
        sourceLine,
        col(),
      );
    }
    const lineNumStartCol = col();
    const lineNumStart = pos;
    while (isDigit(rawLine.charAt(pos))) pos++;
    const lineNumText = rawLine.slice(lineNumStart, pos);
    tokens.push({
      type: "LineNumber",
      text: lineNumText,
      value: Number(lineNumText),
      line: sourceLine,
      col: lineNumStartCol,
    });

    let lineDone = false;
    while (!lineDone && pos < rawLine.length) {
      skipSpaces();
      if (pos >= rawLine.length) break;

      const ch = rawLine.charAt(pos);
      const startCol = col();

      // `'` shorthand comment: consumes verbatim to end of line.
      if (ch === "'") {
        const text = rawLine.slice(pos + 1);
        tokens.push({ type: "Comment", text, value: text, line: sourceLine, col: startCol });
        lineDone = true;
        break;
      }

      if (isAlpha(ch)) {
        const wordStart = pos;
        while (isAlphaNumeric(rawLine.charAt(pos))) pos++;
        const word = rawLine.slice(wordStart, pos);
        const hasSuffix = isSuffix(rawLine.charAt(pos));

        if (!hasSuffix && word.toUpperCase() === "REM") {
          // REM comment: consumes to end of line (one conventional leading
          // space after REM is dropped; further whitespace is kept as-is).
          const afterRem = rawLine.charAt(pos) === " " ? pos + 1 : pos;
          const text = rawLine.slice(afterRem);
          tokens.push({ type: "Comment", text, value: text, line: sourceLine, col: startCol });
          lineDone = true;
          break;
        }

        if (!hasSuffix) {
          const keyword = lookupKeyword(word);
          if (keyword !== undefined) {
            tokens.push({ type: "Keyword", text: keyword, line: sourceLine, col: startCol });
            continue;
          }
        }

        const suffix = hasSuffix ? rawLine.charAt(pos) : "";
        if (hasSuffix) pos++;
        const identifierText = word.toLowerCase() + suffix;
        tokens.push({
          type: "Identifier",
          text: identifierText,
          value: identifierText,
          line: sourceLine,
          col: startCol,
        });
        continue;
      }

      if (isDigit(ch) || (ch === "." && isDigit(rawLine.charAt(pos + 1)))) {
        const numStart = pos;
        while (isDigit(rawLine.charAt(pos))) pos++;
        if (rawLine.charAt(pos) === ".") {
          pos++;
          while (isDigit(rawLine.charAt(pos))) pos++;
        }
        const numText = rawLine.slice(numStart, pos);
        tokens.push({
          type: "Number",
          text: numText,
          value: Number(numText),
          line: sourceLine,
          col: startCol,
        });
        continue;
      }

      if (ch === '"') {
        pos++;
        const strStart = pos;
        while (pos < rawLine.length && rawLine.charAt(pos) !== '"') pos++;
        if (pos >= rawLine.length) {
          throw new LexError("Unterminated string literal", sourceLine, startCol);
        }
        const strText = rawLine.slice(strStart, pos);
        pos++; // consume closing quote
        tokens.push({
          type: "String",
          text: strText,
          value: strText,
          line: sourceLine,
          col: startCol,
        });
        continue;
      }

      if (ch === ":") {
        tokens.push({ type: "Colon", text: ":", line: sourceLine, col: startCol });
        pos++;
        continue;
      }

      const twoChar = rawLine.slice(pos, pos + 2);
      if (twoChar === "<=" || twoChar === ">=" || twoChar === "<>") {
        tokens.push({ type: "Operator", text: twoChar, line: sourceLine, col: startCol });
        pos += 2;
        continue;
      }

      if (SINGLE_CHAR_OPERATORS.includes(ch)) {
        tokens.push({ type: "Operator", text: ch, line: sourceLine, col: startCol });
        pos++;
        continue;
      }

      throw new LexError(`Unexpected character "${ch}"`, sourceLine, startCol);
    }

    tokens.push({ type: "EOL", text: "", line: sourceLine, col: col() });
  }

  tokens.push({ type: "EOF", text: "", line: physicalLines.length + 1, col: 1 });
  return tokens;
}
