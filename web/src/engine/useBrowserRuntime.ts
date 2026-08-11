// Wires src/runtime/browser/browser-runtime.ts's BrowserRuntime to React
// state: a React hook that exposes an output log, a "waiting for input"
// flag + resolver, and an error slot, backed by BrowserRuntime's callback
// hooks. This is the one file allowed to bridge React state and the
// framework-agnostic BrowserRuntime — components consume its return value,
// never BrowserRuntime directly.
//
// TODO (build order step 17): export function useBrowserRuntime(): {
//   output: string[]; pendingPrompt: string | null; submitInput(value: string): void;
//   error: BasicRuntimeError | null; run(js: string): void; reset(): void;
// }

export {};
