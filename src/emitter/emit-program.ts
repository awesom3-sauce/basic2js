// Emitter orchestrator: LoweredProgram -> full JS source text.
//
// TODO (build order step 4): export function emit(lowered: LoweredProgram): string
// - Wrap emit-statements.ts's per-step cases in the `export async function
//   run(rt) { const V = {}, ARR = {}; const forStack = [], gosubStack = [];
//   let dataPtr = 0, pc = 0, __line = 0; const DATA = [...];
//   try { while (pc !== -1) { switch (pc) { ...cases... default: pc = -1; } } }
//   catch (e) { await rt.reportError(toBasicError(e, __line)); } }` shape
//   described in the plan file.
// - Prepend prelude.ts's PRELUDE text.
// - `basic2js convert` writes this as a self-contained ESM file with no
//   import dependency on this compiler's own source tree.

export {};
