// Thin, UI-framework-agnostic wrapper around the compiler core's compile()
// (imported via the '@core' path alias -> src/index.ts). No JSX, no
// styling, no React imports — this file could be reused verbatim by a
// non-React UI rewrite.
//
// compile() throws (LexError/ParseError/SemanticError — see their
// respective files under @core) rather than returning a Result type (see
// SemanticError's own doc comment for why); this wrapper is exactly where
// that gets adapted into something a React component can render without
// every caller needing its own try/catch.
//
// `dialect` (see @core/dialect.js) defaults the same way compile() itself
// does — callers that don't care get "classic" for free.

import { compile } from "@core/index.js";
import { DEFAULT_DIALECT, type Dialect } from "@core/dialect.js";

export type CompileProgramResult =
  { readonly ok: true; readonly js: string } | { readonly ok: false; readonly message: string };

export function compileProgram(
  source: string,
  dialect: Dialect = DEFAULT_DIALECT,
): CompileProgramResult {
  try {
    const { js } = compile(source, dialect);
    return { ok: true, js };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
