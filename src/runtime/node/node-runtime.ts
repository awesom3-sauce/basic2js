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
//
// GW-BASIC dialect file I/O (see src/dialect.ts) is backed by real
// `node:fs` here — unlike BrowserRuntime/TestRuntime, which share an
// in-memory VirtualFileSystem (runtime/shared/virtual-fs.ts) since neither
// has a real filesystem to use. An OPEN...FOR INPUT file reuses the exact
// same "drive a readline.Interface via its async iterator" technique as
// console input above, for the same reason; unlike console input, though,
// `EOF(n)` needs to answer synchronously (see interface.ts's doc comment
// on why), so each input file's *next* line is eagerly pre-fetched right
// after OPEN and after every readFileLine — "is there a next line" is
// then always already known without any further I/O.

import * as readline from "node:readline";
import { createReadStream } from "node:fs";
import { appendFile, writeFile as writeWholeFile } from "node:fs/promises";
import type { BasicRuntime } from "../interface.js";
import type { BasicRuntimeError } from "../shared/errors.js";
import { SeedableRandom } from "../shared/random.js";

interface NodeInputFileEntry {
  readonly mode: "input";
  readonly rl: readline.Interface;
  readonly iterator: AsyncIterator<string>;
  pending: string | null;
  eof: boolean;
}

interface NodeOutputFileEntry {
  readonly mode: "output" | "append";
  readonly path: string;
}

type NodeFileEntry = NodeInputFileEntry | NodeOutputFileEntry;

export class NodeRuntime implements BasicRuntime {
  private rl: readline.Interface | undefined;
  private lines: AsyncIterator<string> | undefined;
  // Unseeded default (wall-clock-derived, see SeedableRandom) — matches
  // real BASIC's "unseeded RND still varies run to run" behavior. Call
  // RANDOMIZE for deterministic output.
  private readonly rng = new SeedableRandom();
  private readonly openFiles = new Map<number, NodeFileEntry>();
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

  async openFile(
    fileNumber: number,
    path: string,
    mode: "input" | "output" | "append",
  ): Promise<void> {
    if (this.openFiles.has(fileNumber)) {
      throw new Error(`FILE ERROR: file #${fileNumber} is already open`);
    }

    if (mode === "input") {
      const stream = createReadStream(path);
      // createReadStream() doesn't throw synchronously for e.g. a missing
      // file — the error only ever surfaces via the stream's "error"
      // event, asynchronously. Wait for either that or "open" (confirming
      // the file genuinely opened) before OPEN itself resolves, so a bad
      // path fails right at OPEN rather than being deferred to the first
      // INPUT #.
      await new Promise<void>((resolve, reject) => {
        stream.once("open", () => resolve());
        stream.once("error", (err: Error) => {
          reject(new Error(`FILE ERROR: could not open "${path}": ${err.message}`));
        });
      });
      const rl = readline.createInterface({ input: stream });
      const entry: NodeInputFileEntry = {
        mode: "input",
        rl,
        iterator: rl[Symbol.asyncIterator](),
        pending: null,
        eof: false,
      };
      await this.advanceInputFile(entry);
      this.openFiles.set(fileNumber, entry);
    } else {
      try {
        // OUTPUT truncates immediately (matching real GW-BASIC); APPEND
        // creates the file if it's missing but otherwise leaves existing
        // content untouched — writeFile()'s flag "a" does exactly that.
        if (mode === "output") await writeWholeFile(path, "", "utf-8");
        else await appendFile(path, "", "utf-8");
      } catch (e) {
        throw new Error(
          `FILE ERROR: could not open "${path}": ${e instanceof Error ? e.message : String(e)}`,
        );
      }
      this.openFiles.set(fileNumber, { mode, path });
    }
  }

  async closeFile(fileNumber: number): Promise<void> {
    const entry = this.openFiles.get(fileNumber);
    if (entry === undefined) return; // no-op — matches real GW-BASIC's CLOSE
    if (entry.mode === "input") entry.rl.close();
    this.openFiles.delete(fileNumber);
  }

  async closeAllFiles(): Promise<void> {
    for (const fileNumber of [...this.openFiles.keys()]) {
      await this.closeFile(fileNumber);
    }
  }

  async writeFile(fileNumber: number, text: string): Promise<void> {
    await appendFile(this.requireOutput(fileNumber).path, text, "utf-8");
  }

  async readFileLine(fileNumber: number): Promise<string> {
    const entry = this.requireInput(fileNumber);
    if (entry.eof) {
      throw new Error(`FILE ERROR: attempted to read past the end of file #${fileNumber}`);
    }
    // Safe: eof is false, so a pre-fetched line is guaranteed present.
    const line = entry.pending!;
    await this.advanceInputFile(entry);
    return line;
  }

  isFileEof(fileNumber: number): boolean {
    return this.requireInput(fileNumber).eof;
  }

  private async advanceInputFile(entry: NodeInputFileEntry): Promise<void> {
    const { value, done } = await entry.iterator.next();
    // IteratorResult's `done` is technically optional per the iterator
    // protocol (`boolean | undefined`) — readline's async iterator always
    // sets it, but normalize defensively rather than assume that.
    entry.eof = done ?? false;
    entry.pending = entry.eof ? null : value;
  }

  private requireInput(fileNumber: number): NodeInputFileEntry {
    const entry = this.openFiles.get(fileNumber);
    if (entry === undefined) throw new Error(`FILE ERROR: file #${fileNumber} is not open`);
    if (entry.mode !== "input") {
      throw new Error(
        `FILE ERROR: file #${fileNumber} is open for ${entry.mode.toUpperCase()}, not INPUT`,
      );
    }
    return entry;
  }

  private requireOutput(fileNumber: number): NodeOutputFileEntry {
    const entry = this.openFiles.get(fileNumber);
    if (entry === undefined) throw new Error(`FILE ERROR: file #${fileNumber} is not open`);
    if (entry.mode === "input") {
      throw new Error(`FILE ERROR: file #${fileNumber} is open for INPUT, not OUTPUT/APPEND`);
    }
    return entry;
  }

  /** Releases the stdin readline interface (if one was ever created) and any still-open GW-BASIC dialect file handles. Call after run() completes. */
  close(): void {
    this.rl?.close();
    for (const entry of this.openFiles.values()) {
      if (entry.mode === "input") entry.rl.close();
    }
  }
}
