// Public compiler API — the ONLY module the CLI and the web UI's
// web/src/engine layer are allowed to import from the compiler core. See
// CLAUDE.md's pipeline diagram and the plan file's "UI replaceability
// contract".
//
// Pipeline (build order steps 1-4 so far): tokenize -> parse -> lower ->
// emit. TODO (build order step 16): add a `diagnostics: Diagnostic[]`
// field once the semantic analyzer (src/semantics/analyzer.ts) exists —
// deliberately not faked as an always-empty array now, since that would
// misleadingly imply semantic checking already runs.

import { tokenize } from "./lexer/lexer.js";
import { parse } from "./parser/parser.js";
import { lower } from "./ir/lowering.js";
import { emit } from "./emitter/emit-program.js";
import type { Program } from "./ast/program.js";
import type { LoweredProgram } from "./ir/program.js";

export interface CompileResult {
  readonly js: string;
  readonly ast: Program;
  readonly lowered: LoweredProgram;
}

export function compile(source: string): CompileResult {
  const tokens = tokenize(source);
  const ast = parse(tokens);
  const lowered = lower(ast);
  const js = emit(lowered);
  return { js, ast, lowered };
}
