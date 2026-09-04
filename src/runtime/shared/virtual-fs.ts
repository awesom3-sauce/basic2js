// An in-memory filesystem backing GW-BASIC dialect file I/O (see
// src/dialect.ts) for hosts with no real filesystem access — BrowserRuntime
// (a browser tab genuinely has none) and TestRuntime (deterministic,
// no-real-disk-I/O testability). NodeRuntime does NOT use this: it backs
// file I/O with real `node:fs` instead, since the whole point of running
// under Node is that a real filesystem *is* available.
//
// Genuinely shared, not just similar: both callers want the exact same
// open-file-table bookkeeping (error messages, mode validation, EOF
// tracking) over an injectable `Map<string, string>` (filename -> full
// content) "disk" — composed in, not inherited, so each `BasicRuntime`
// implementation still owns its own class per CLAUDE.md's runtime host
// contract.
//
// All public methods return Promises to match `BasicRuntime`'s file I/O
// method shapes (see runtime/interface.ts) even though nothing here ever
// actually awaits anything — an in-memory Map needs no real async I/O —
// so a caller can use this interchangeably with NodeRuntime's real-fs
// version without knowing which one it's holding.

type FileEntry = InputFileEntry | OutputFileEntry;

interface InputFileEntry {
  readonly mode: "input";
  readonly lines: readonly string[];
  index: number;
}

interface OutputFileEntry {
  readonly mode: "output" | "append";
  readonly name: string;
  buffer: string;
}

export class VirtualFileSystem {
  private readonly openFiles = new Map<number, FileEntry>();

  /**
   * @param disk The backing "filesystem" — filename -> full content. Pass a
   *   `Map` you keep a reference to (e.g. React state) if you want to
   *   inspect what a program wrote after it runs; defaults to a private,
   *   throwaway one otherwise. Persists across multiple `openFile` calls
   *   (and, if you hold onto the same `VirtualFileSystem` instance, across
   *   multiple compiled programs' runs) exactly like a real disk would.
   */
  constructor(private readonly disk: Map<string, string> = new Map()) {}

  /** Read-only view of the backing store, for a UI to show what's been written (e.g. a "Virtual Files" panel). */
  get files(): ReadonlyMap<string, string> {
    return this.disk;
  }

  // Every method below that can fail is declared `async` — not just for
  // style, but so a failure is genuinely a *rejected* Promise, matching
  // `Promise<void>`/`Promise<string>`'s contract (and NodeRuntime's real
  // `async` methods) rather than a synchronous `throw` from a
  // Promise-typed, non-async function. Real bug found via direct testing
  // (virtual-fs.test.ts): a bare (non-async) function that `throw`s before
  // ever reaching its `return Promise.resolve(...)` throws synchronously,
  // not as a rejection — harmless for emitted code's `await rt.foo(...)`
  // (a synchronous throw during argument evaluation is still caught by the
  // surrounding try/catch exactly like a rejection would be), but a real
  // footgun for any other caller using `.catch(...)`/`Promise.all([...])`,
  // which would see an uncaught exception instead of a rejection.

  async openFile(
    fileNumber: number,
    path: string,
    mode: "input" | "output" | "append",
  ): Promise<void> {
    if (this.openFiles.has(fileNumber)) {
      throw fileError(`file #${fileNumber} is already open`);
    }

    if (mode === "input") {
      const content = this.disk.get(path);
      if (content === undefined) {
        throw fileError(`could not open "${path}": no such file`);
      }
      this.openFiles.set(fileNumber, { mode: "input", lines: splitLines(content), index: 0 });
    } else {
      // OUTPUT truncates immediately (matching real GW-BASIC's OPEN...FOR
      // OUTPUT); APPEND starts from whatever's already on "disk".
      const existing = mode === "append" ? (this.disk.get(path) ?? "") : "";
      if (mode === "output") this.disk.set(path, "");
      this.openFiles.set(fileNumber, { mode, name: path, buffer: existing });
    }
  }

  async closeFile(fileNumber: number): Promise<void> {
    // A no-op (not an error) for a file number that isn't open — matches
    // real GW-BASIC's CLOSE.
    this.openFiles.delete(fileNumber);
  }

  async closeAllFiles(): Promise<void> {
    this.openFiles.clear();
  }

  async writeFile(fileNumber: number, text: string): Promise<void> {
    const entry = this.requireOutput(fileNumber);
    entry.buffer += text;
    this.disk.set(entry.name, entry.buffer);
  }

  async readFileLine(fileNumber: number): Promise<string> {
    const entry = this.requireInput(fileNumber);
    if (entry.index >= entry.lines.length) {
      throw fileError(`attempted to read past the end of file #${fileNumber}`);
    }
    // Safe: just bounds-checked above.
    return entry.lines[entry.index++]!;
  }

  isFileEof(fileNumber: number): boolean {
    const entry = this.requireInput(fileNumber);
    return entry.index >= entry.lines.length;
  }

  /** Looks up `fileNumber`, throwing a FILE ERROR if it's not open at all or not open for INPUT. Narrows to `InputFileEntry` on success. */
  private requireInput(fileNumber: number): InputFileEntry {
    const entry = this.requireOpen(fileNumber);
    if (entry.mode !== "input") {
      throw fileError(`file #${fileNumber} is open for ${entry.mode.toUpperCase()}, not INPUT`);
    }
    return entry;
  }

  /** Looks up `fileNumber`, throwing a FILE ERROR if it's not open at all or open for INPUT. Narrows to `OutputFileEntry` on success. */
  private requireOutput(fileNumber: number): OutputFileEntry {
    const entry = this.requireOpen(fileNumber);
    if (entry.mode === "input") {
      throw fileError(`file #${fileNumber} is open for INPUT, not OUTPUT/APPEND`);
    }
    return entry;
  }

  private requireOpen(fileNumber: number): FileEntry {
    const entry = this.openFiles.get(fileNumber);
    if (entry === undefined) {
      throw fileError(`file #${fileNumber} is not open`);
    }
    return entry;
  }
}

function fileError(message: string): Error {
  // "FILE ERROR: " prefix matches prelude.ts's __toBasicError classification
  // (see errors.ts's FILE_ERROR code) — these errors are thrown from real
  // TS runtime code, not prelude.ts text, but still flow through the same
  // dispatch-loop top-level catch, so the prefix convention has to match.
  return new Error(`FILE ERROR: ${message}`);
}

/**
 * Splits file content into lines the way `readFileLine` hands them out —
 * without trailing newlines, and (matching real text files, which
 * conventionally end with one) a single trailing empty line from a final
 * "\n" is dropped rather than surfacing as an extra empty read.
 */
function splitLines(content: string): readonly string[] {
  if (content === "") return [];
  const lines = content.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
