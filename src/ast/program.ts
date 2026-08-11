// Top-level AST shape.

import type { Statement } from "./statements.js";

export interface Line {
  readonly kind: "Line";
  readonly lineNumber: number;
  readonly statements: readonly Statement[];
  /**
   * Raw source text of this physical line, for future debugging/dumping
   * tools. Not yet populated by the parser (tokenize()'s Token[] output
   * doesn't carry the original line text) — left as "" until a real
   * consumer needs it, at which point either the lexer should attach it to
   * tokens or parse() should take the original source alongside its tokens.
   */
  readonly source: string;
}

/** Lines are always kept sorted by `lineNumber` — see parser.ts. */
export interface Program {
  readonly kind: "Program";
  readonly lines: readonly Line[];
}
