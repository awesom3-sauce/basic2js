// The BasicRuntime host contract — the sole boundary between generated JS
// and its execution environment (Node CLI vs. browser vs. test harness).
// Emitted code only ever talks to this interface, never to
// process.stdout/DOM/etc. directly, so multiple runtime implementations
// can execute the exact same compiled output — see CLAUDE.md's "runtime
// host contract" section.
//
// Scope note: `input`/`random`/`seedRandom`/`reportError` were all declared
// back in step 5 as placeholders and are now fully real — INPUT (step 9),
// RND/RANDOMIZE (step 14), and `reportError`'s `BasicRuntimeError` taxonomy
// (step 16, see runtime/shared/errors.ts) all landed as their respective
// steps arrived.

import type { BasicRuntimeError } from "./shared/errors.js";

export interface BasicRuntime {
  print(text: string): void | Promise<void>;
  /** The suspension point once INPUT (step 9) starts calling it. */
  input(promptText: string | null): Promise<string>;
  /** 0 <= x < 1, for RND (step 14). */
  random(): number;
  /** RANDOMIZE <n> (step 14). */
  seedRandom(seed: number): void;
  reportError(error: BasicRuntimeError): void | Promise<void>;
  onStart?(programSource: string): void;
  onEnd?(reason: "end" | "stop" | "error"): void;
  /** Optional hook for a future step-debugging UI; not called by emitted code yet. */
  onLineEnter?(lineNumber: number): void;
}
