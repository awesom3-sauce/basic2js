// Lexer error type — thrown by tokenize() on malformed source (missing
// leading line number, unterminated string, unrecognized character).

export class LexError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly col: number,
  ) {
    super(`${message} (line ${line}, col ${col})`);
    this.name = "LexError";
  }
}
