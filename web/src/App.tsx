// Composes the UI components + owns top-level state (source text, compiled
// JS, output log, pending-input state, errors). Contains NO compiler logic
// of its own — everything compiler-related goes through ./engine.
//
// This is one of exactly two files (with main.tsx) a future UI redesign
// necessarily touches; components/** can be swapped freely against the same
// ./engine contract. See CLAUDE.md's "UI replaceability contract".
//
// TODO (build order step 17): compose <Toolbar>, <CodeEditor>,
// <GeneratedJsView>, <OutputConsole>, <InputPrompt>, <ExamplesMenu>,
// <ErrorPanel>, wired via ./engine/compileProgram.ts and
// ./engine/useBrowserRuntime.ts.

export {};
