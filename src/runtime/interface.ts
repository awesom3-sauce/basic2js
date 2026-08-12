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
//
// The six `*File*`/`isFileEof` methods back the GW-BASIC dialect extension
// (sequential file I/O — `OPEN`/`CLOSE`/`PRINT #`/`INPUT #`/`EOF()`, see
// src/dialect.ts); like `input`, real file access has to come from the
// host, since emitted code has no I/O capability of its own. They're
// required (not optional) on the interface — every first-party
// implementation (Node/Browser/Test) supports them fully — but are only
// ever called by code compiled under the `"gwbasic"` dialect; a
// `"classic"`-dialect program never references them. `isFileEof` is the
// one synchronous exception: real file reads are inherently async, but a
// runtime can always answer "was the *last* read the end of the file?"
// synchronously from state it already cached during that read, which is
// all `EOF(n)` ever needs to know at the point a BASIC program calls it
// (immediately after a real read already happened) — this sidesteps
// needing `await`-capable expression evaluation anywhere in emitted code
// outside of INPUT, which the emitter (emit-expressions.ts) doesn't
// support and was never going to be worth adding for this alone.

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

  /** `OPEN path FOR mode AS #fileNumber` — GW-BASIC dialect extension. Throws a `"FILE ERROR: ..."`-prefixed Error on failure (see errors.ts's `BasicErrorCode`). */
  openFile(fileNumber: number, path: string, mode: "input" | "output" | "append"): Promise<void>;
  /** `CLOSE #fileNumber`. A no-op (not an error) if that file isn't currently open, matching real GW-BASIC. */
  closeFile(fileNumber: number): Promise<void>;
  /** A bare `CLOSE` — closes every currently-open file. */
  closeAllFiles(): Promise<void>;
  /** `PRINT #fileNumber, ...`'s sink. Throws if `fileNumber` isn't open for output/append. */
  writeFile(fileNumber: number, text: string): Promise<void>;
  /** `INPUT #fileNumber, ...`'s source — one line, without its trailing newline. Throws if `fileNumber` isn't open for input, or if already at end of file. */
  readFileLine(fileNumber: number): Promise<string>;
  /** `EOF(fileNumber)` — see this file's header comment for why this is synchronous. Throws if `fileNumber` isn't open. */
  isFileEof(fileNumber: number): boolean;
}
