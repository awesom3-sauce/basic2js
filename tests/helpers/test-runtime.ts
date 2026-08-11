// In-memory BasicRuntime implementation used by both colocated unit tests
// (executing emitted code directly) and golden tests
// (tests/golden/golden.test.ts) — see CLAUDE.md's "runtime host contract".

import type { BasicRuntime } from "../../src/runtime/interface.js";
import { SeedableRandom } from "../../src/runtime/shared/random.js";

export class TestRuntime implements BasicRuntime {
  readonly printed: string[] = [];
  readonly errors: Error[] = [];
  private readonly scriptedInput: string[];
  // Fixed default seed (unlike NodeRuntime's wall-clock default) — an
  // accidentally-unseeded test should fail the same way every run, not
  // flake. Tests exercising RND for real should still call RANDOMIZE
  // explicitly (see DIALECT.md's Open Decisions), same as any golden test.
  private readonly rng = new SeedableRandom(1);

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
    return this.rng.next();
  }

  seedRandom(seed: number): void {
    this.rng.seed(seed);
  }

  reportError(error: Error): void {
    this.errors.push(error);
  }

  /** All printed text concatenated — the usual thing golden/behavioral tests assert on. */
  get output(): string {
    return this.printed.join("");
  }
}
