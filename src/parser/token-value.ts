// Defensive accessors for Token.value's runtime type. The lexer guarantees
// Number tokens carry a numeric value and String/Identifier/Comment tokens
// carry a string value, but Token.value is typed as `string | number |
// undefined` at rest (see src/lexer/token.ts) — these narrow it at the
// parser boundary with a clear internal-error message if that guarantee is
// ever violated, instead of scattering `as number`/`as string` casts.

import type { Token } from "../lexer/token.js";

export function numberValue(token: Token): number {
  if (typeof token.value !== "number") {
    throw new Error(
      `Internal error: expected a numeric value on ${token.type} token at line ${token.line}`,
    );
  }
  return token.value;
}

export function stringValue(token: Token): string {
  if (typeof token.value !== "string") {
    throw new Error(
      `Internal error: expected a string value on ${token.type} token at line ${token.line}`,
    );
  }
  return token.value;
}
