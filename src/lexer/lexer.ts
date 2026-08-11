// BASIC source -> Token[] lexer.
//
// TODO (build order step 1):
// - export function tokenize(source: string): Token[]
// - Handle: leading line numbers, keywords (via keywords.ts, case-insensitive),
//   identifiers with trailing %/!/#/$ type suffix, numeric literals (int/float),
//   string literals ("..."), operators (+ - * / \ ^ = <> < > <= >= : , ; ( )),
//   REM / ' comments (consume to end of line), end-of-line as a token.
// - Colocate lexer.test.ts next to this file per CLAUDE.md testing conventions.

export {};
