// Public compiler API — the ONLY module the CLI and the web UI's
// web/src/engine layer are allowed to import from the compiler core. See
// CLAUDE.md's pipeline diagram and the plan file's "UI replaceability
// contract".
//
// TODO (build order steps 1-16, assembled incrementally as each pipeline
// stage lands): export function compile(source: string): {
//   js: string;
//   ast: Program;
//   steps: Step[];
//   diagnostics: Diagnostic[];
// }
// Pipeline: tokenize -> parse -> analyze -> lower -> emit.

export {};
