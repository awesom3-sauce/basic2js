// Public compiler API — the ONLY module the CLI and the web UI's
// web/src/engine layer are allowed to import from the compiler core. See
// CLAUDE.md's pipeline diagram and the plan file's "UI replaceability
// contract".
//
// Pipeline: tokenize -> parse -> analyze -> lower -> emit. `analyze` (build
// order step 15/16) throws a SemanticError — see semantics/semantic-error.ts's
// header comment for why compile() fails fast on a diagnostic rather than
// returning a non-throwing `diagnostics` field alongside best-effort
// output, the design an earlier version of this comment had sketched:
// proceeding to lower/emit a program known to misbehave (e.g. a
// `$`-suffixed variable actually holding a number) isn't better than
// refusing to compile, the same way a syntax error already isn't.
//
// `dialect` (see src/dialect.ts) now reaches tokenize(), parse(), and
// emit() — see src/dialect.ts's own doc comment for exactly what each
// stage uses it for. analyze() and lower() stay dialect-agnostic.

import { tokenize } from "./lexer/lexer.js";
import { parse } from "./parser/parser.js";
import { analyze } from "./semantics/analyzer.js";
import { SemanticError } from "./semantics/semantic-error.js";
import { lower } from "./ir/lowering.js";
import { emit } from "./emitter/emit-program.js";
import type { Program } from "./ast/program.js";
import type { LoweredProgram } from "./ir/program.js";
import { DEFAULT_DIALECT, type Dialect } from "./dialect.js";

export interface CompileResult {
  readonly js: string;
  readonly ast: Program;
  readonly lowered: LoweredProgram;
}

export function compile(source: string, dialect: Dialect = DEFAULT_DIALECT): CompileResult {
  const tokens = tokenize(source, dialect);
  const ast = parse(tokens, dialect);
  const diagnostics = analyze(ast);
  if (diagnostics.length > 0) throw new SemanticError(diagnostics);
  const lowered = lower(ast);
  const js = emit(lowered, dialect);
  return { js, ast, lowered };
}
