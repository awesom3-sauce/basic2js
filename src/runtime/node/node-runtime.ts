// Node.js implementation of BasicRuntime — backs the CLI's `run` command.
//
// Scope note (build order step 5, "minimal NodeRuntime"): print/reportError
// are real; input/random/seedRandom are placeholders until steps 9/14 give
// them something to do (the currently-supported PRINT/LET/GOTO subset
// never calls them).

import * as readline from "node:readline/promises";
import type { BasicRuntime } from "../interface.js";

export class NodeRuntime implements BasicRuntime {
  private rl: readline.Interface | undefined;

  print(text: string): void {
    process.stdout.write(text);
  }

  async input(promptText: string | null): Promise<string> {
    // Lazily created and reused across multiple INPUT statements in one
    // run(), rather than one readline interface per call.
    this.rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
    return this.rl.question(promptText ?? "");
  }

  random(): number {
    return Math.random();
  }

  seedRandom(_seed: number): void {
    // TODO (build order step 14): wire up the seedable PRNG in
    // src/runtime/shared/random.ts so RANDOMIZE <n> is deterministic.
  }

  reportError(error: Error): void {
    process.stderr.write(`${error.message}\n`);
  }

  /** Releases the stdin readline interface, if one was ever created. Call after run() completes. */
  close(): void {
    this.rl?.close();
  }
}
