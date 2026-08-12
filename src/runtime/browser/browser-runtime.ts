// Browser implementation of BasicRuntime — wrapped by web/src/engine's
// useBrowserRuntime.ts for the React UI. Framework-agnostic on its own (no
// DOM manipulation, no React import): every observable effect is reported
// through a small set of constructor-supplied callbacks instead, so it can
// be driven by React state (or any other UI layer) without this file ever
// touching the DOM directly — see CLAUDE.md's UI replaceability contract.
//
// `onStart`/`onEnd`/`onLineEnter` (BasicRuntime's other optional hooks)
// aren't wired up here: emitted code never actually calls them yet (see
// runtime/interface.ts's doc comment — they're reserved for a future
// step-debugging UI), so there's nothing for BrowserRuntime to forward.
// The "is a program currently running" state useBrowserRuntime.ts exposes
// instead just wraps the call to the emitted module's `run()` directly.
//
// GW-BASIC dialect file I/O (see src/dialect.ts) is backed by
// VirtualFileSystem (runtime/shared/virtual-fs.ts) — a browser tab has no
// real filesystem. `files`'s backing `Map` is accepted from the caller
// (rather than created fresh here) specifically so useBrowserRuntime.ts
// can hold onto the same `Map` across multiple `run()` calls/BrowserRuntime
// instances, giving the virtual "disk" real persistence across runs within
// one session — matching how a real disk would behave, and letting a
// "Virtual Files" UI panel show what a program wrote after it finishes.

import type { BasicRuntime } from "../interface.js";
import type { BasicRuntimeError } from "../shared/errors.js";
import { SeedableRandom } from "../shared/random.js";
import { VirtualFileSystem } from "../shared/virtual-fs.js";

export interface BrowserRuntimeCallbacks {
  onPrint(text: string): void;
  /** Resolves once the UI layer calls back with the value the user typed (see useBrowserRuntime.ts's `submitInput`). */
  onInput(promptText: string | null): Promise<string>;
  onError(error: BasicRuntimeError): void;
}

export class BrowserRuntime implements BasicRuntime {
  // Unseeded default (wall-clock-derived, see SeedableRandom) — matches
  // NodeRuntime's "unseeded RND still varies run to run" behavior. Call
  // RANDOMIZE for deterministic output.
  private readonly rng = new SeedableRandom();
  private readonly vfs: VirtualFileSystem;

  constructor(
    private readonly callbacks: BrowserRuntimeCallbacks,
    files: Map<string, string> = new Map(),
  ) {
    this.vfs = new VirtualFileSystem(files);
  }

  print(text: string): void {
    this.callbacks.onPrint(text);
  }

  input(promptText: string | null): Promise<string> {
    return this.callbacks.onInput(promptText);
  }

  random(): number {
    return this.rng.next();
  }

  seedRandom(seed: number): void {
    this.rng.seed(seed);
  }

  reportError(error: BasicRuntimeError): void {
    this.callbacks.onError(error);
  }

  openFile(fileNumber: number, path: string, mode: "input" | "output" | "append"): Promise<void> {
    return this.vfs.openFile(fileNumber, path, mode);
  }

  closeFile(fileNumber: number): Promise<void> {
    return this.vfs.closeFile(fileNumber);
  }

  closeAllFiles(): Promise<void> {
    return this.vfs.closeAllFiles();
  }

  writeFile(fileNumber: number, text: string): Promise<void> {
    return this.vfs.writeFile(fileNumber, text);
  }

  readFileLine(fileNumber: number): Promise<string> {
    return this.vfs.readFileLine(fileNumber);
  }

  isFileEof(fileNumber: number): boolean {
    return this.vfs.isFileEof(fileNumber);
  }
}
