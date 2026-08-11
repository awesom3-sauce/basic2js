// In-memory BasicRuntime implementation used by both colocated unit tests
// (executing emitted code directly) and golden tests
// (tests/golden/golden.test.ts) — see CLAUDE.md's "runtime host contract".

import type { BasicRuntime } from "../../src/runtime/interface.js";

export class TestRuntime implements BasicRuntime {
  readonly printed: string[] = [];
  readonly errors: Error[] = [];
  private readonly scriptedInput: string[];

  constructor(scriptedInput: readonly string[] = []) {
    this.scriptedInput = [...scriptedInput];
  }

  print(text: string): void {
    this.printed.push(text);
  }

  async input(promptText: string | null): Promise<string> {
    if (promptText !== null) this.printed.push(promptText);
    const next = this.scriptedInput.shift();
    if (next === undefined) {
      throw new Error("TestRuntime: ran out of scripted input");
    }
    return next;
  }

  random(): number {
    return Math.random();
  }

  seedRandom(_seed: number): void {
    // No-op until build order step 14 wires up a real seedable PRNG.
  }

  reportError(error: Error): void {
    this.errors.push(error);
  }

  /** All printed text concatenated — the usual thing golden/behavioral tests assert on. */
  get output(): string {
    return this.printed.join("");
  }
}
