// Helpers for converting a caught JS exception (or an internal invariant
// violation) into a BasicRuntimeError tagged with the current BASIC line.
//
// TODO (build order step 16): export function toBasicError(e: unknown, line:
// number): BasicRuntimeError — used in emit-program.ts's top-level
// try/catch around the dispatch loop.

export {};
