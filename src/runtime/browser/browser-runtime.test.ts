import { describe, expect, it, vi } from "vitest";
import { BrowserRuntime } from "./browser-runtime.js";
import type { BasicRuntimeError } from "../shared/errors.js";

describe("BrowserRuntime", () => {
  it("forwards print() to onPrint", () => {
    const onPrint = vi.fn();
    const rt = new BrowserRuntime({ onPrint, onInput: vi.fn(), onError: vi.fn() });
    rt.print("HELLO\n");
    expect(onPrint).toHaveBeenCalledWith("HELLO\n");
  });

  it("forwards input() to onInput and returns its resolved value", async () => {
    const onInput = vi.fn().mockResolvedValue("42");
    const rt = new BrowserRuntime({ onPrint: vi.fn(), onInput, onError: vi.fn() });
    await expect(rt.input("GUESS? ")).resolves.toBe("42");
    expect(onInput).toHaveBeenCalledWith("GUESS? ");
  });

  it("forwards reportError() to onError", () => {
    const onError = vi.fn();
    const rt = new BrowserRuntime({ onPrint: vi.fn(), onInput: vi.fn(), onError });
    const error = { message: "OVERFLOW", code: "OVERFLOW", line: 10 } as BasicRuntimeError;
    rt.reportError(error);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it("random() produces values in [0, 1), and seedRandom() makes it deterministic", () => {
    const rt = new BrowserRuntime({ onPrint: vi.fn(), onInput: vi.fn(), onError: vi.fn() });
    rt.seedRandom(42);
    const first = rt.random();
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(1);

    const other = new BrowserRuntime({ onPrint: vi.fn(), onInput: vi.fn(), onError: vi.fn() });
    other.seedRandom(42);
    expect(other.random()).toBe(first);
  });

  // GW-BASIC dialect extension (see src/dialect.ts) — BrowserRuntime's file
  // I/O methods delegate to VirtualFileSystem (see virtual-fs.test.ts for
  // its own thorough coverage); these tests only need to confirm the
  // delegation itself, plus the one thing genuinely specific to
  // BrowserRuntime: that the caller-supplied `files` Map is the real
  // backing store (persists across separate BrowserRuntime instances) —
  // this is exactly what useBrowserRuntime.ts relies on to keep a virtual
  // "disk" alive across multiple runs in one session.
  it("openFile/writeFile/closeFile round-trip through the caller-supplied files Map", async () => {
    const files = new Map<string, string>();
    const rt = new BrowserRuntime({ onPrint: vi.fn(), onInput: vi.fn(), onError: vi.fn() }, files);
    await rt.openFile(1, "A.TXT", "output");
    await rt.writeFile(1, "HELLO\n");
    await rt.closeFile(1);
    expect(files.get("A.TXT")).toBe("HELLO\n");
  });

  it("a second BrowserRuntime over the same files Map sees what a prior instance wrote", async () => {
    const files = new Map<string, string>();
    const writer = new BrowserRuntime(
      { onPrint: vi.fn(), onInput: vi.fn(), onError: vi.fn() },
      files,
    );
    await writer.openFile(1, "A.TXT", "output");
    await writer.writeFile(1, "PERSISTED");
    await writer.closeFile(1);

    const reader = new BrowserRuntime(
      { onPrint: vi.fn(), onInput: vi.fn(), onError: vi.fn() },
      files,
    );
    await reader.openFile(2, "A.TXT", "input");
    expect(await reader.readFileLine(2)).toBe("PERSISTED");
    expect(reader.isFileEof(2)).toBe(true);
  });

  it("defaults to a private, throwaway files Map when none is supplied", async () => {
    const rt = new BrowserRuntime({ onPrint: vi.fn(), onInput: vi.fn(), onError: vi.fn() });
    await rt.openFile(1, "A.TXT", "output");
    await rt.writeFile(1, "X");
    await rt.closeFile(1);
    await rt.openFile(2, "A.TXT", "input");
    expect(await rt.readFileLine(2)).toBe("X");
  });
});
