// Shared exhaustiveness-checking helper — see CLAUDE.md's "Conventions"
// section. Every switch over a Statement['kind'] or Expression['kind'] (in
// the semantic analyzer, lowering, and emitter) should end with a
// `default: return assertNever(node);` case, so adding a new AST node kind
// without updating every consumer becomes a compile-time TS error (the
// `never` parameter type stops being satisfiable) rather than a silent
// runtime bug.

export function assertNever(value: never, context?: string): never {
  throw new Error(`Unreachable case${context ? ` in ${context}` : ""}: ${JSON.stringify(value)}`);
}
