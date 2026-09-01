// A small mutable cursor over a Token[], shared by parser.ts,
// parse-statements.ts, and parse-expressions.ts. Chosen over threading a
// plain numeric position index through every parse function's parameters
// and return values (the shape the original stub sketched) — a cursor
// object is harder to get wrong (no risk of forgetting to propagate an
// updated position) and keeps every parse function's signature to just
// `(cursor: TokenCursor) => Node`.

import type { Token, TokenType } from "../lexer/token.js";
import type { Dialect, DialectSpec } from "../dialect.js";
import { DEFAULT_DIALECT, getDialectSpec } from "../dialect.js";
import { ParseError } from "./errors.js";

export class TokenCursor {
  private pos = 0;
  /** The active dialect's full capability spec — see src/dialect.ts. Resolved once here so every dialect-gated parse function reads it straight off the cursor. */
  readonly dialectSpec: DialectSpec;

  constructor(
    private readonly tokens: readonly Token[],
    /** Which BASIC dialect is being parsed — see src/dialect.ts. Kept only as the constructor input `dialectSpec` is resolved from; dialect-gated parse functions read `dialectSpec` off the cursor instead of this raw literal. */
    readonly dialect: Dialect = DEFAULT_DIALECT,
  ) {
    if (tokens.length === 0) {
      throw new Error("TokenCursor: token stream must at least contain an EOF token");
    }
    this.dialectSpec = getDialectSpec(dialect);
  }

  /** The token `offset` positions ahead of the cursor (0 = current). Clamps at EOF. */
  peek(offset = 0): Token {
    const index = Math.min(this.pos + offset, this.tokens.length - 1);
    // Safe: constructor guarantees at least one token, and index is clamped
    // into range, so this is never actually undefined.
    return this.tokens[index] as Token;
  }

  current(): Token {
    return this.peek(0);
  }

  /** Consumes and returns the current token. Never advances past EOF. */
  advance(): Token {
    const token = this.current();
    if (token.type !== "EOF") this.pos++;
    return token;
  }

  check(type: TokenType, text?: string): boolean {
    const token = this.current();
    return token.type === type && (text === undefined || token.text === text);
  }

  /** If the current token matches, consumes it and returns true; otherwise leaves the cursor untouched. */
  match(type: TokenType, text?: string): boolean {
    if (this.check(type, text)) {
      this.advance();
      return true;
    }
    return false;
  }

  /** Consumes and returns the current token if it matches, else throws a ParseError. */
  expect(type: TokenType, text?: string): Token {
    if (!this.check(type, text)) {
      const token = this.current();
      throw new ParseError(
        `Expected ${describeExpected(type, text)}, found ${describeToken(token)}`,
        token.line,
        token.col,
      );
    }
    return this.advance();
  }
}

function describeExpected(type: TokenType, text?: string): string {
  if (text !== undefined) return `"${text}"`;
  return type;
}

function describeToken(token: Token): string {
  if (token.type === "EOF") return "end of input";
  if (token.type === "EOL") return "end of line";
  return `"${token.text}"`;
}
