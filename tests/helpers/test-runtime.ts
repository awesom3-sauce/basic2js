// In-memory BasicRuntime implementation used by both colocated unit tests
// (executing emitted code directly) and golden tests
// (tests/golden/golden.test.ts) — see CLAUDE.md's "runtime host contract".

import type { BasicRuntime } from "../../src/runtime/interface.js";
import type { BasicRuntimeError } from "../../src/runtime/shared/errors.js";
import { SeedableRandom } from "../../src/runtime/shared/random.js";
import { VirtualFileSystem } from "../../src/runtime/shared/virtual-fs.js";

export class TestRuntime implements BasicRuntime {
  readonly printed: string[] = [];
  readonly errors: BasicRuntimeError[] = [];
  private readonly scriptedInput: string[];
  // Fixed default seed (unlike NodeRuntime's wall-clock default) — an
  // accidentally-unseeded test should fail the same way every run, not
  // flake. Tests exercising RND for real should still call RANDOMIZE
  // explicitly (see DIALECT.md's Open Decisions), same as any golden test.
  private readonly rng = new SeedableRandom(1);
  private readonly vfs: VirtualFileSystem;

  /**
   * @param scriptedInput Console INPUT values, consumed in order.
   * @param files Pre-seeded GW-BASIC dialect "disk" contents (filename ->
   *   content) for tests exercising `OPEN ... FOR INPUT` — pass the same
   *   `Map` back in to assert on what a program wrote after it runs (or
   *   read `.vfs.files` directly).
   */
  constructor(scriptedInput: readonly string[] = [], files: Map<string, string> = new Map()) {
    this.scriptedInput = [...scriptedInput];
    this.vfs = new VirtualFileSystem(files);
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

  reportError(error: BasicRuntimeError): void {
    this.errors.push(error);
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

  /** The GW-BASIC dialect virtual "disk" — filename -> full content, after any writes a run performed. */
  get files(): ReadonlyMap<string, string> {
    return this.vfs.files;
  }

  /** All printed text concatenated — the usual thing golden/behavioral tests assert on. */
  get output(): string {
    return this.printed.join("");
  }
}
