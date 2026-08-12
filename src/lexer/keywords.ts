// Case-insensitive keyword lookup table for the BASIC lexer.
//
// Only true syntactic keywords live here — statement/operator words that
// can never carry a %/!/#/$ type suffix. Builtin functions like LEFT$/MID$/
// CHR$/STR$ are NOT keywords: they tokenize as ordinary Identifier tokens
// and are resolved against a builtin-function table later, when the parser
// builds a CallExpr (see DIALECT.md's builtin function list).

const KEYWORDS: ReadonlySet<string> = new Set([
  "PRINT",
  "INPUT",
  "LET",
  "IF",
  "THEN",
  "ELSE",
  "FOR",
  "TO",
  "STEP",
  "NEXT",
  "GOTO",
  "GOSUB",
  "RETURN",
  "ON",
  "WHILE",
  "WEND",
  "DIM",
  "DATA",
  "READ",
  "RESTORE",
  "DEF",
  "FN",
  "RANDOMIZE",
  "REM",
  "END",
  "STOP",
  "AND",
  "OR",
  "NOT",
  "MOD",
  // GW-BASIC dialect extension (file I/O) — see src/dialect.ts. Always
  // lexed as keywords regardless of which dialect is active, same as every
  // other keyword; the parser is what gates them to the "gwbasic" dialect,
  // not the lexer (see parse-statements.ts's requireGwBasic).
  "OPEN",
  "CLOSE",
  "AS",
  "OUTPUT",
  "APPEND",
]);

/**
 * Looks up `word` case-insensitively against the keyword table. Returns the
 * canonical UPPERCASE spelling if it's a keyword, `undefined` otherwise.
 */
export function lookupKeyword(word: string): string | undefined {
  const upper = word.toUpperCase();
  return KEYWORDS.has(upper) ? upper : undefined;
}
