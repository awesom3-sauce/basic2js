// Statement parsing — one parse function per Statement kind, dispatched by
// the leading token in parseStatement().
//
// Implemented: PRINT (including TAB()/SPC() segments as of step 14), LET
// (explicit `LET` and implicit assignment), GOTO, REM (via the lexer's
// Comment token), END, STOP (build order step 2), IF/THEN/ELSE (build order
// step 6), FOR/NEXT (build order step 7), GOSUB/RETURN/ON...GOTO/ON...GOSUB
// (build order step 8), INPUT (build order step 9), DIM/array l-values
// (build order step 10), DATA/READ/RESTORE (build order step 11),
// WHILE/WEND (build order step 12), DEF FN (build order step 13, see
// parseDefFnStmt for a scope note on the "FN A" vs. "FNA" spelling), and
// RANDOMIZE (build order step 14). Builtin function calls (LEN, LEFT$, ...)
// aren't statements — see parse-expressions.ts/builtins.ts instead. Every
// keyword the lexer still doesn't recognize as a statement raises a clear
// "not implemented yet" ParseError rather than being silently mis-parsed.
//
// OPEN/CLOSE, plus PRINT/INPUT's `#fileNumber` forms, are the GW-BASIC
// dialect extension (see src/dialect.ts) — gated by `requireGwBasic`
// rather than by the lexer, since these keywords/operators are always
// tokenized regardless of dialect (so a classic-dialect program using them
// gets a clear dialect-mismatch error, not a confusing generic one).

import type {
  CloseStmt,
  DataStmt,
  DataValue,
  DefFnParam,
  DefFnStmt,
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
  OpenStmt,
  PrintSegment,
  PrintStmt,
  RandomizeStmt,
  ReadStmt,
  RestoreStmt,
  Statement,
  WhileStmt,
} from "../ast/statements.js";
import type { Expression } from "../ast/expressions.js";
import { parseExpression, parseIndexList } from "./parse-expressions.js";
import { splitSuffix } from "./identifier.js";
import { numberValue, stringValue } from "./token-value.js";
import { ParseError } from "./errors.js";
import type { Token } from "../lexer/token.js";
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

/**
 * Throws a clear ParseError if `cursor.dialect` isn't `"gwbasic"` — guards
 * every GW-BASIC-only construct (OPEN/CLOSE, PRINT #/INPUT #'s file-number
 * form — see src/dialect.ts). `token` supplies the error's line/col,
 * typically the keyword/operator token that triggered the check.
 */
function requireGwBasic(cursor: TokenCursor, token: Token, feature: string): void {
  if (cursor.dialect !== "gwbasic") {
    throw new ParseError(
      `${feature} is a GW-BASIC dialect extension — select the GW-BASIC dialect to use it`,
      token.line,
      token.col,
    );
  }
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
      case "DEF":
        return parseDefFnStmt(cursor);
      case "RANDOMIZE":
        return parseRandomizeStmt(cursor);
      case "OPEN":
        return parseOpenStmt(cursor);
      case "CLOSE":
        return parseCloseStmt(cursor);
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
  const printToken = cursor.expect("Keyword", "PRINT");

  // `PRINT #n, ...` (GW-BASIC dialect extension — see OpenStmt's doc
  // comment). The "#" is checked regardless of dialect (the lexer always
  // tokenizes it — see lexer.ts's SINGLE_CHAR_OPERATORS note), so a
  // classic-dialect program using this form gets a clear
  // dialect-mismatch error here rather than a confusing generic one.
  let fileNumber: Expression | undefined;
  if (cursor.check("Operator", "#")) {
    requireGwBasic(cursor, printToken, "PRINT #");
    fileNumber = parseFileNumber(cursor);
    cursor.match("Operator", ",");
  }

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

    const tabOrSpc = tryParseTabOrSpc(cursor);
    if (tabOrSpc !== undefined) {
      segments.push(tabOrSpc);
      atValueBoundary = true;
      continue;
    }

    segments.push({ kind: "value", expr: parseExpression(cursor) });
    atValueBoundary = true;
  }

  return { kind: "PrintStmt", segments, fileNumber };
}

/**
 * Recognizes `TAB(expr)`/`SPC(expr)` at the cursor's current position, only
 * when the identifier is immediately followed by `(` — real classic BASIC
 * restricts TAB/SPC to PRINT's argument list (see PrintSegment's doc
 * comment in ast/statements.ts), unlike the general builtin-function
 * registry in builtins.ts, so they're recognized here rather than through
 * the normal expression-level CallExpr path. Returns undefined (consuming
 * nothing) if the cursor isn't at one of these two forms, so the caller can
 * fall through to ordinary value-expression parsing.
 */
function tryParseTabOrSpc(cursor: TokenCursor): PrintSegment | undefined {
  const isTab = cursor.check("Identifier", "tab");
  const isSpc = cursor.check("Identifier", "spc");
  if (!isTab && !isSpc) return undefined;
  const next = cursor.peek(1);
  if (next.type !== "Operator" || next.text !== "(") return undefined;

  const token = cursor.advance(); // consume "tab"/"spc"
  const args = parseIndexList(cursor);
  if (args.length !== 1) {
    throw new ParseError(
      `${isTab ? "TAB" : "SPC"} expects 1 argument, got ${args.length}`,
      token.line,
      token.col,
    );
  }
  return { kind: isTab ? "tab" : "spc", expr: args[0]! };
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
      // Keep the full name+suffix spelling (NOT splitSuffix(...).name) —
      // this has to match a ForStep's varKey-formatted `key` (name+suffix,
      // see mangle.ts) for __nextFor's `frame.key === variable` lookup to
      // ever succeed for a suffixed loop variable. Real bug found via
      // direct testing: `FOR I% = 1 TO 3: NEXT I%` raised a spurious
      // "NEXT WITHOUT FOR" because the stored variable name ("i") never
      // matched the frame's key ("i%") — see CLAUDE.md's step 15 notes.
      variables.push(stringValue(token));
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
  const inputToken = cursor.expect("Keyword", "INPUT");

  // `INPUT #n, var[, var...]` (GW-BASIC dialect extension) — no prompt is
  // ever allowed in this form, so it's handled as an entirely separate
  // branch rather than folded into the prompt-parsing logic below.
  if (cursor.check("Operator", "#")) {
    requireGwBasic(cursor, inputToken, "INPUT #");
    const fileNumber = parseFileNumber(cursor);
    cursor.match("Operator", ",");
    return {
      kind: "InputStmt",
      appendQuestionMark: false, // irrelevant for file input — no prompt is ever printed
      targets: parseLValueList(cursor),
      fileNumber,
    };
  }

  let prompt: string | undefined;
  let appendQuestionMark = true;
  if (cursor.check("String")) {
    prompt = stringValue(cursor.advance());
    appendQuestionMark = !cursor.match("Operator", ",");
    if (appendQuestionMark) cursor.expect("Operator", ";");
  }

  return { kind: "InputStmt", prompt, appendQuestionMark, targets: parseLValueList(cursor) };
}

/** `var[, var...]` — shared by INPUT, INPUT #, and READ's target lists. */
function parseLValueList(cursor: TokenCursor): LValue[] {
  const targets: LValue[] = [];
  for (;;) {
    targets.push(parseLValue(cursor));
    if (!cursor.match("Operator", ",")) break;
  }
  return targets;
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
  return { kind: "ReadStmt", targets: parseLValueList(cursor) };
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

/**
 * `DEF FN name(param[, param...]) = expr`.
 *
 * Scope decision (see DIALECT.md): requires a space between `FN` and the
 * function name — `DEF FN A(X) = ...`, not the concatenated `DEF FNA(X) =
 * ...` some classic BASIC listings also allow. With the space, `FN`
 * always lexes as its own Keyword token (see src/lexer/lexer.ts's noted
 * limitation from build order step 1); without one, "FNA" lexes as a
 * single Identifier token indistinguishable from a bare variable, which
 * would need either lexer state or a symbol-table-aware two-pass parse to
 * resolve. Requiring the space sidesteps that entirely, and as a bonus
 * makes `FN name(...)` call expressions (see parsePrimary in
 * parse-expressions.ts) unambiguous with array references too — a call is
 * always preceded by the `FN` keyword, an array reference never is.
 */
function parseDefFnStmt(cursor: TokenCursor): DefFnStmt {
  cursor.expect("Keyword", "DEF");
  cursor.expect("Keyword", "FN");
  const { name, suffix } = splitSuffix(stringValue(cursor.expect("Identifier")));

  cursor.expect("Operator", "(");
  const params: DefFnParam[] = [];
  if (!cursor.check("Operator", ")")) {
    for (;;) {
      const param = splitSuffix(stringValue(cursor.expect("Identifier")));
      params.push({ name: param.name, suffix: param.suffix });
      if (!cursor.match("Operator", ",")) break;
    }
  }
  cursor.expect("Operator", ")");

  cursor.expect("Operator", "=");
  const body = parseExpression(cursor);

  return { kind: "DefFnStmt", name, suffix, params, body };
}

/**
 * `RANDOMIZE seed`. See RandomizeStmt's doc comment (ast/statements.ts) for
 * why `seed` is required in v1, unlike real GW-BASIC's optional argument.
 */
function parseRandomizeStmt(cursor: TokenCursor): RandomizeStmt {
  cursor.expect("Keyword", "RANDOMIZE");
  const seed = parseExpression(cursor);
  return { kind: "RandomizeStmt", seed };
}

/**
 * `OPEN path FOR mode AS #fileNumber` (GW-BASIC dialect extension — see
 * src/dialect.ts and OpenStmt's doc comment in ast/statements.ts).
 */
function parseOpenStmt(cursor: TokenCursor): OpenStmt {
  const openToken = cursor.expect("Keyword", "OPEN");
  requireGwBasic(cursor, openToken, "OPEN");
  const path = parseExpression(cursor);
  cursor.expect("Keyword", "FOR");
  const mode = parseFileMode(cursor);
  cursor.expect("Keyword", "AS");
  const fileNumber = parseFileNumber(cursor);
  return { kind: "OpenStmt", path, mode, fileNumber };
}

function parseFileMode(cursor: TokenCursor): "input" | "output" | "append" {
  if (cursor.match("Keyword", "OUTPUT")) return "output";
  if (cursor.match("Keyword", "APPEND")) return "append";
  if (cursor.match("Keyword", "INPUT")) return "input";
  const token = cursor.current();
  throw new ParseError(
    `Expected INPUT, OUTPUT, or APPEND after "OPEN ... FOR", found "${token.text}"`,
    token.line,
    token.col,
  );
}

/**
 * `CLOSE [#n [, #n...]]` (GW-BASIC dialect extension). An empty list closes
 * every currently-open file, matching real GW-BASIC.
 */
function parseCloseStmt(cursor: TokenCursor): CloseStmt {
  const closeToken = cursor.expect("Keyword", "CLOSE");
  requireGwBasic(cursor, closeToken, "CLOSE");
  const fileNumbers: Expression[] = [];
  if (!isStatementEnd(cursor)) {
    for (;;) {
      fileNumbers.push(parseFileNumber(cursor));
      if (!cursor.match("Operator", ",")) break;
    }
  }
  return { kind: "CloseStmt", fileNumbers };
}

/**
 * Consumes an optional `#` then a file-number expression — shared by
 * `OPEN`'s `AS #n`, `CLOSE`'s `#n` list, and `PRINT #`/`INPUT #`'s leading
 * file number. The `#` is optional everywhere it appears, matching real
 * GW-BASIC (`AS #1` and `AS 1` are both legal) — except `PRINT`/`INPUT`,
 * where it's required, since that's the only signal distinguishing the
 * file-directed form from the ordinary console form at that position.
 */
function parseFileNumber(cursor: TokenCursor): Expression {
  cursor.match("Operator", "#");
  return parseExpression(cursor);
}
