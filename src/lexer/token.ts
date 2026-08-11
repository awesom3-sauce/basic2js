// Token and TokenType definitions for the BASIC lexer.

/**
 * Every distinct kind of token the lexer can produce.
 *
 * - `LineNumber` — the required leading line number of a physical line.
 * - `Keyword` — a reserved word from keywords.ts, normalized to its
 *   canonical UPPERCASE spelling (e.g. "PRINT", "GOTO").
 * - `Identifier` — a variable/array/function name, normalized to lowercase,
 *   with any trailing %/!/#/$ type suffix included verbatim in `text`.
 *   Builtin function names (LEFT$, MID$, ...) are also `Identifier` tokens
 *   at the lexer level — they aren't reserved words, just names the parser
 *   later resolves against a builtin table when building a CallExpr.
 * - `Number` — a numeric literal; `value` holds the parsed number.
 * - `String` — a string literal; `value` holds the unescaped contents
 *   (quotes stripped, case preserved — BASIC syntax is case-insensitive but
 *   string *data* never is).
 * - `Operator` — +  -  *  /  \  ^  =  <>  <  >  <=  >=  ,  ;  (  )
 * - `Colon` — the `:` multi-statement separator (kept distinct from
 *   `Operator` since the parser treats it specially as a statement break).
 * - `Comment` — the text of a REM or `'` comment, from just after the
 *   REM keyword / apostrophe to the end of the physical line. REM/`'`
 *   themselves are not emitted as separate tokens — see lexer.ts.
 * - `EOL` — end of one physical (line-numbered) source line.
 * - `EOF` — end of the whole source, always the last token produced.
 */
export type TokenType =
  | "LineNumber"
  | "Keyword"
  | "Identifier"
  | "Number"
  | "String"
  | "Operator"
  | "Colon"
  | "Comment"
  | "EOL"
  | "EOF";

export interface Token {
  readonly type: TokenType;
  /** Exact (or normalized, per TokenType above) source text of the token. */
  readonly text: string;
  /** Parsed value, where relevant (Number -> number, String/Identifier/Comment -> string). */
  readonly value?: string | number;
  /** 1-based physical source line. */
  readonly line: number;
  /** 1-based column within that physical line. */
  readonly col: number;
}
