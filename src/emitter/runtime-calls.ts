// Maps BASIC builtin function names to the runtime helper call the emitter
// should generate (see src/runtime/shared/*).
//
// TODO (build order step 14): a table like
//   { 'LEFT$': 'strings.left', 'MID$': 'strings.mid', 'INT': 'math.intFloor',
//     'RND': 'rt.random', ... }
// consumed by emit-expressions.ts when lowering a CallExpr.

export {};
