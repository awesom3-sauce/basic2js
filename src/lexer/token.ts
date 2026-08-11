// Token and TokenType definitions for the BASIC lexer.
//
// TODO (build order step 1, see CLAUDE.md "Staged Build Order"):
// - Define `TokenType` as a string-literal union covering: line numbers,
//   keywords (see keywords.ts), identifiers (with attached type suffix),
//   number/string literals, operators/punctuation, colon, end-of-line,
//   end-of-file.
// - Define `Token { type: TokenType; text: string; line: number; col: number }`
//   (attach source position for parser error messages).

export {};
