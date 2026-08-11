# Contributing

## Dev workflow

```bash
npm install
npm run typecheck && npm test && npm run lint    # run before every commit
```

Branch naming: `feature/<short-description>` or `fix/<short-description>`. Work through
[CLAUDE.md](CLAUDE.md)'s staged build order roughly in sequence — later stages assume earlier ones
are solid (e.g. don't build `DATA`/`READ` support on top of a `FOR`/`NEXT` implementation that
isn't passing its golden tests yet).

## Adding a golden fixture

1. Create `tests/golden/programs/<name>/program.bas` — a real, runnable BASIC program exercising
   the feature(s) you're adding coverage for.
2. If the program uses `INPUT`, add `tests/golden/programs/<name>/input.txt` — one scripted input
   value per line, consumed in order by `tests/helpers/test-runtime.ts`'s `TestRuntime`.
3. Run the program's expected output through the reference behavior you're implementing against
   (hand-computed, or cross-checked against a real BASIC interpreter if available) and save it as
   `tests/golden/programs/<name>/expected.txt`.
4. `tests/golden/golden.test.ts` auto-discovers every subdirectory under `programs/` — no
   per-fixture test registration needed.
5. If the program uses `RND`, it **must** call `RANDOMIZE <fixed-seed>` — see DIALECT.md's locked
   RNG-determinism default.
6. Consider mirroring the fixture into `web/src/examples/` so it's also selectable from the web
   UI's `ExamplesMenu` (keep the `.bas` source text identical between the two locations).

## Running a single test file

```bash
npx vitest run src/lexer/lexer.test.ts
npx vitest run tests/golden/golden.test.ts
```

## Debugging generated code

The CLI's `run`/`convert` commands support (once implemented per CLAUDE.md's build order step 19):

```bash
node dist/cli/index.js run program.bas --emit-ast     # dump the parsed AST instead of executing
node dist/cli/index.js run program.bas --emit-steps    # dump the lowered Step[]/lineToStep IR
node dist/cli/index.js convert program.bas -o out.js   # write the emitted JS to a file for inspection
```

## Lint / format

```bash
npm run lint       # eslint .
npm run format     # prettier --write .
```

## Web UI dev

```bash
npm run web:dev      # vite dev server, http://localhost:5173 by default
npm run web:build     # production build -> web/dist, matches what Vercel deploys
```

Remember the [UI replaceability contract](CLAUDE.md#ui-replaceability-contract) — new UI code goes
in `web/src/components/<ComponentName>/` (component + its own CSS module) or `web/src/engine/`
(framework-agnostic bridging code only, no JSX). Never import from `src/**` (the compiler core)
anywhere in `web/src/components/` — go through `web/src/engine/` instead.

## PR checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (colocated unit tests + golden tests)
- [ ] `npm run lint` passes
- [ ] Any new BASIC statement/function/edge-case behavior is documented in [DIALECT.md](DIALECT.md)
- [ ] Any new AST node kind has exhaustive `switch` handling (via `assertNever`) in every consumer
      (analyzer, lowering, emitter) — check for a TS error if you forgot one
