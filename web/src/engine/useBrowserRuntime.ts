// Wires src/runtime/browser/browser-runtime.ts's BrowserRuntime to React
// state: a React hook that exposes an output log, a "waiting for input"
// flag + resolver, an error slot, and a virtual-filesystem snapshot, backed
// by BrowserRuntime's callback hooks. This is the one file allowed to
// bridge React state and the framework-agnostic BrowserRuntime —
// components consume its return value, never BrowserRuntime directly.
//
// Virtual files (GW-BASIC dialect OPEN/CLOSE/PRINT #/INPUT #, see
// src/dialect.ts): BrowserRuntime accepts its backing `Map<string, string>`
// from the caller specifically so it can persist across multiple `run()`
// calls — this hook is that caller. The Map itself lives in a ref (mutated
// in place by BrowserRuntime/VirtualFileSystem, not replaced), so `files`
// is mirrored into real React state as a snapshot taken right after each
// run completes, which is the only point its contents can have changed.

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
  /** Snapshot of the virtual filesystem's contents (GW-BASIC dialect only), filename -> full text. Persists across runs within the session. */
  readonly files: ReadonlyMap<string, string>;
  /** Compiles-and-runs already having produced `js` — resets state first. */
  readonly run: (js: string) => Promise<void>;
  readonly reset: () => void;
  /** Clears the virtual filesystem entirely (does not affect output/error/running state). */
  readonly clearFiles: () => void;
}

export function useBrowserRuntime(): UseBrowserRuntime {
  const [output, setOutput] = useState<string[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [error, setError] = useState<BasicRuntimeError | null>(null);
  const [running, setRunning] = useState(false);
  const [files, setFiles] = useState<ReadonlyMap<string, string>>(new Map());
  const resolveInputRef = useRef<((value: string) => void) | null>(null);
  const filesRef = useRef<Map<string, string>>(new Map());

  const reset = useCallback(() => {
    setOutput([]);
    setPendingPrompt(null);
    setError(null);
    setRunning(false);
    resolveInputRef.current = null;
    // Deliberately does NOT touch filesRef/files — a real disk survives a
    // console "Reset" too; see clearFiles() for an explicit wipe.
  }, []);

  const clearFiles = useCallback(() => {
    filesRef.current.clear();
    setFiles(new Map());
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
      const runtime = new BrowserRuntime(
        {
          onPrint: (text) => setOutput((prev) => [...prev, text]),
          onInput: (promptText) =>
            new Promise<string>((resolve) => {
              resolveInputRef.current = resolve;
              setPendingPrompt(promptText ?? "");
            }),
          onError: (err) => setError(err),
        },
        filesRef.current,
      );
      try {
        const mod = await importModuleFromSource(js);
        const runProgram = mod.run as (rt: BrowserRuntime) => Promise<void>;
        await runProgram(runtime);
      } finally {
        setRunning(false);
        // filesRef.current was mutated in place by BrowserRuntime during the
        // run (if the program used OPEN/PRINT #/etc.) — snapshot it into a
        // new Map so React sees a changed reference and re-renders.
        setFiles(new Map(filesRef.current));
      }
    },
    [reset],
  );

  return { output, pendingPrompt, submitInput, error, running, files, run, reset, clearFiles };
}
