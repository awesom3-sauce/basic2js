// Thin, UI-framework-agnostic wrapper around the compiler core's compile()
// (imported via the '@core' path alias -> src/index.ts). No JSX, no
// styling, no React imports — this file could be reused verbatim by a
// non-React UI rewrite.
//
// TODO (build order step 17): export function compileProgram(source: string)
// { ... } — call @core's compile(), shape the result for UI consumption
// (e.g. flatten diagnostics into a display-friendly list).

export {};
