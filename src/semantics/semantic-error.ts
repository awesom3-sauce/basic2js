// Thrown by compile() (src/index.ts) when analyzer.ts's analyze() finds one
// or more Diagnostics — mirrors ParseError's "fail fast with a clear
// message" convention (src/parser/errors.ts) rather than the non-throwing
// "collect and return alongside best-effort output" design CompileResult's
// original TODO comment once sketched. That non-throwing design was
// deliberately not what got built: emitted JS that's known to misbehave
// (e.g. a "$"-suffixed variable actually holding a number) is worse than
// refusing to compile, the same way a syntax error is — and throwing means
// zero new plumbing was needed in the CLI or (eventually) the web UI, since
// both already catch and report any thrown Error uniformly. Unlike
// ParseError (which can only ever report the single error that stopped
// parsing), a program can have multiple independent type mismatches, so
// this collects every Diagnostic analyze() found into one message rather
// than only the first.

import type { Diagnostic } from "./diagnostic.js";

export class SemanticError extends Error {
  constructor(public readonly diagnostics: readonly Diagnostic[]) {
    super(SemanticError.formatMessage(diagnostics));
    this.name = "SemanticError";
  }

  private static formatMessage(diagnostics: readonly Diagnostic[]): string {
    return diagnostics.map((d) => `line ${d.line}: ${d.message} [${d.code}]`).join("\n");
  }
}
