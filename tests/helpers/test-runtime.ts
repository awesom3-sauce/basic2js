// In-memory BasicRuntime implementation used by both unit tests (executing
// emitted code directly) and golden tests (tests/golden/golden.test.ts).
//
// TODO (build order step 5, expanded through the whole plan as features
// land): export class TestRuntime implements BasicRuntime
// - print(text) -> pushes to an internal string[] (joined for assertions).
// - input(promptText) -> shifts off a pre-scripted string[] passed at
//   construction; throws a clear "test ran out of scripted input" error if
//   exhausted (never silently hangs).
// - random()/seedRandom() -> delegate to src/runtime/shared/random.ts so
//   RANDOMIZE-seeded golden programs are deterministic.
// - reportError(error) -> records it for assertion instead of throwing.

export {};
