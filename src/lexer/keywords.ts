// Case-insensitive keyword lookup table for the BASIC lexer.
//
// TODO (build order step 1):
// - Map every reserved word (PRINT, INPUT, LET, IF, THEN, ELSE, FOR, TO, STEP,
//   NEXT, GOTO, GOSUB, RETURN, ON, WHILE, WEND, DIM, DATA, READ, RESTORE,
//   DEF, FN, REM, END, STOP, AND, OR, NOT, MOD) to a TokenType.
// - Lookup must lowercase the candidate identifier first — see DIALECT.md's
//   "case-insensitive syntax, case-sensitive string data" rule.

export {};
