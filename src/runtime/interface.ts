// The BasicRuntime host contract — the sole boundary between generated JS
// and its execution environment (Node CLI vs. browser vs. test harness).
// Emitted code only ever talks to this interface, never to
// process.stdout/DOM/etc. directly, so multiple runtime implementations
// can execute the exact same compiled output — see CLAUDE.md's "runtime
// host contract" section.
//
// Scope note (build order step 5, "minimal NodeRuntime"): `input`/
// `random`/`seedRandom` are declared now (cheap — the currently-supported
// PRINT/LET/GOTO subset never calls them) but NodeRuntime only gives them
// throwaway/placeholder implementations until INPUT (step 9) and RND/
// RANDOMIZE (step 14) actually land. `reportError` takes a plain `Error`
// for now; step 16 introduces the richer `BasicRuntimeError` (with an
// error-code taxonomy) this will be narrowed to, once emitted code has
// something (division-by-zero, subscript-out-of-range, ...) that actually
// needs to raise one.

export interface BasicRuntime {
  print(text: string): void | Promise<void>;
  /** The suspension point once INPUT (step 9) starts calling it. */
  input(promptText: string | null): Promise<string>;
  /** 0 <= x < 1, for RND (step 14). */
  random(): number;
  /** RANDOMIZE <n> (step 14). */
  seedRandom(seed: number): void;
  reportError(error: Error): void | Promise<void>;
  onStart?(programSource: string): void;
  onEnd?(reason: "end" | "stop" | "error"): void;
  /** Optional hook for a future step-debugging UI; not called by emitted code yet. */
  onLineEnter?(lineNumber: number): void;
}
