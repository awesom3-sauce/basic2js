// Wires src/runtime/browser/browser-runtime.ts's BrowserRuntime to React
// state: a React hook that exposes an output log, a "waiting for input"
// flag + resolver, and an error slot, backed by BrowserRuntime's callback
// hooks. This is the one file allowed to bridge React state and the
// framework-agnostic BrowserRuntime — components consume its return value,
// never BrowserRuntime directly.

import { useCallback, useRef, useState } from "react";
import { BrowserRuntime } from "@core/runtime/browser/browser-runtime.js";
import type { BasicRuntimeError } from "@core/runtime/shared/errors.js";
import { importModuleFromSource } from "@core/util/load-js-module.js";

export interface UseBrowserRuntime {
  /** Each PRINT call's raw text, in order — join to reconstruct the full console output. */
  readonly output: readonly string[];
  /** Non-null while the program is suspended in INPUT, waiting for a value. */
  readonly pendingPrompt: string | null;
  /** Resolves the pending INPUT with the given value; a no-op if nothing is pending. */
  readonly submitInput: (value: string) => void;
  readonly error: BasicRuntimeError | null;
  readonly running: boolean;
  /** Compiles-and-runs already having produced `js` — resets state first. */
  readonly run: (js: string) => Promise<void>;
  readonly reset: () => void;
}

export function useBrowserRuntime(): UseBrowserRuntime {
  const [output, setOutput] = useState<string[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [error, setError] = useState<BasicRuntimeError | null>(null);
  const [running, setRunning] = useState(false);
  const resolveInputRef = useRef<((value: string) => void) | null>(null);

  const reset = useCallback(() => {
    setOutput([]);
    setPendingPrompt(null);
    setError(null);
    setRunning(false);
    resolveInputRef.current = null;
  }, []);

  const submitInput = useCallback((value: string) => {
    const resolve = resolveInputRef.current;
    if (resolve === null) return;
    resolveInputRef.current = null;
    setPendingPrompt(null);
    resolve(value);
  }, []);

  const run = useCallback(
    async (js: string) => {
      reset();
      setRunning(true);
      const runtime = new BrowserRuntime({
        onPrint: (text) => setOutput((prev) => [...prev, text]),
        onInput: (promptText) =>
          new Promise<string>((resolve) => {
            resolveInputRef.current = resolve;
            setPendingPrompt(promptText ?? "");
          }),
        onError: (err) => setError(err),
      });
      try {
        const mod = await importModuleFromSource(js);
        const runProgram = mod.run as (rt: BrowserRuntime) => Promise<void>;
        await runProgram(runtime);
      } finally {
        setRunning(false);
      }
    },
    [reset],
  );

  return { output, pendingPrompt, submitInput, error, running, run, reset };
}
