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
});
