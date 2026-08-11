// Node.js implementation of BasicRuntime — used by the CLI's `run` command.
//
// TODO (build order step 5): export class NodeRuntime implements BasicRuntime
// - print(text) -> process.stdout.write(text)
// - input(promptText) -> node:readline/promises interface's .question()
// - random()/seedRandom() -> src/runtime/shared/random.ts
// - reportError(error) -> pretty-print to stderr with the BASIC line number

export {};
