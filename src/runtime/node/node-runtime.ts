// Node.js implementation of BasicRuntime — backs the CLI's `run` command.
//
// Scope note: print/reportError (step 5), input (step 9), and
// random/seedRandom (step 14, backed by SeedableRandom — see
// runtime/shared/random.ts) are all real now.
//
// input() deliberately does NOT use readline/promises' high-level
// `.question()`, despite that being the obvious API for this. Verified by
// direct experimentation: when stdin is a non-TTY pipe (`echo "a\nb" |
// node ...`, or any real usage of `basic2js run program.bas < input.txt`)
// and both lines of input arrive in the same underlying 'data' event, a
// SECOND `await rl.question(...)` call never resolves — readline has
// already internally buffered the second line before the second
// `.question()`'s listener is registered to receive it. This is a real
// Node readline/promises gotcha with piped input, not a hypothetical
// concern, since piping input from a file is an entirely ordinary way to
// run a BASIC program non-interactively. Driving the plain (non-promises)
// `readline.Interface` via its async iterator instead reads buffered
// lines correctly regardless of how many arrived in one underlying chunk.

import * as readline from "node:readline";
import type { BasicRuntime } from "../interface.js";
import type { BasicRuntimeError } from "../shared/errors.js";
import { SeedableRandom } from "../shared/random.js";

export class NodeRuntime implements BasicRuntime {
  private rl: readline.Interface | undefined;
  private lines: AsyncIterator<string> | undefined;
  // Unseeded default (wall-clock-derived, see SeedableRandom) — matches
  // real BASIC's "unseeded RND still varies run to run" behavior. Call
  // RANDOMIZE for deterministic output.
  private readonly rng = new SeedableRandom();
  private _hadError = false;

  /**
   * True once reportError has ever been called (build order step 19) — the
   * dispatch loop's top-level catch always reports and then simply *stops*
   * (see emit-program.ts), so `await run(rt)` itself never rejects for a
   * BASIC runtime error the way it does for a JS-level bug in the runtime
   * host. The CLI's `run` command checks this after `run()` resolves to
   * decide whether to exit non-zero — see commands/run.ts.
   */
  get hadError(): boolean {
    return this._hadError;
  }

  print(text: string): void {
    process.stdout.write(text);
  }

  async input(promptText: string | null): Promise<string> {
    // Lazily created and reused across multiple INPUT statements in one
    // run(), rather than one readline interface per call.
    if (this.rl === undefined) {
      this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      this.lines = this.rl[Symbol.asyncIterator]();
    }
    if (promptText !== null) process.stdout.write(promptText);
    // Safe: set together with this.rl just above.
    const { value, done } = await this.lines!.next();
    return done ? "" : value;
  }

  random(): number {
    return this.rng.next();
  }

  seedRandom(seed: number): void {
    this.rng.seed(seed);
  }

  reportError(error: BasicRuntimeError): void {
    this._hadError = true;
    // error.message is already self-descriptive (every prelude.ts helper's
    // thrown message starts with its own human-readable code text, e.g.
    // "OVERFLOW: ..." — see __toBasicError), so this doesn't re-prefix
    // error.code too, which would just read as "OVERFLOW: OVERFLOW: ...".
    process.stderr.write(`${error.message} (line ${error.line})\n`);
  }

  /** Releases the stdin readline interface, if one was ever created. Call after run() completes. */
  close(): void {
    this.rl?.close();
  }
}
