# CLAUDE.md

Guidance for Claude Code (and any other agent or contributor) working in this repository.

## What this project is

`basic2js` converts classic line-numbered BASIC (GW-BASIC/Applesoft/Dartmouth style — see
[DIALECT.md](DIALECT.md) for the exact supported syntax) into JavaScript that behaves **1:1**
with the original program, including full support for unstructured `GOTO`/`GOSUB` control flow.
It ships as a Node.js CLI (`basic2js convert`, `basic2js run`) and a small web UI
([web/](web/), deployed to Vercel).

It is currently a **single, focused language pair** (BASIC → JS), not a generic multi-language
framework — see "Future: multiple language pairs" below for the deliberate seam that keeps a
later generalization cheap without forcing that complexity on v1.

## Pipeline

```
BASIC source
  → Lexer          (src/lexer)        → Token[]
  → Parser          (src/parser)       → AST (Program)              (src/ast)
  → Semantic analyzer (src/semantics)  → Diagnostic[] (type checks, undefined-line-target checks)
  → Lowering         (src/ir)          → Step[] + lineToStep (a flat, statement-granularity IR)
  → Emitter           (src/emitter)     → JS source text (an async dispatch-loop `run(rt)` function)
  → Runtime            (src/runtime)     → executes the emitted JS, given a host (Node or browser)
```

The **public entry point** is `compile(source: string)` in [src/index.ts](src/index.ts). The CLI
and the web UI's `web/src/engine/` layer are the only permitted importers of the compiler core —
nothing else should reach into `src/lexer`, `src/parser`, etc. directly.

## The core architectural idea: the dispatch-loop / virtual-PC emitter

BASIC's `GOTO`/`GOSUB`/`ON...GOTO` don't map onto structured JS control flow. Instead of trying to
reconstruct structured `if`/`while` from arbitrary jumps, every BASIC _statement_ (not line —
colon-separated statements each get their own slot) is lowered to one `case` in a JS
`while (pc !== -1) { switch (pc) { ... } }` loop, running inside a single `async function run(rt)`.
`GOTO`/`GOSUB` become `pc = <target>; continue;`. `INPUT` is the only place that `await`s,
suspending the loop at exactly the right point using native JS async machinery — no hand-rolled
generators or continuation-passing.

Program state (variables, arrays, the `FOR`/`NEXT` stack, the `GOSUB` return-address stack, the
`DATA` pointer, `pc` itself) lives entirely inside the `run()` closure, keyed into plain `V`
(scalars) / `ARR` (arrays) objects — **not** as bare JS identifiers (sidesteps reserved-word
collisions) and **not** on the injected runtime host (keeps the host a pure I/O adapter, so
multiple independent `run()` calls never share state).

See the plan file used to scaffold this project (referenced in git history / commit message) for
the full illustrative shape of emitted code, and [DIALECT.md](DIALECT.md) for the exact
per-statement lowering rules (especially `IF`/`THEN`/`ELSE` clause-extends-to-end-of-line, and
`FOR`/`NEXT`'s runtime-stack vs. `WHILE`/`WEND`'s static-nesting distinction).

## The runtime host contract

`src/runtime/interface.ts` defines `BasicRuntime` — `print`, `input` (the async suspension point),
`random`/`seedRandom`, `reportError`, plus optional lifecycle hooks. Emitted JS only ever talks to
this interface, never to `process.stdout`/DOM/etc. directly. Three implementations exist (or will,
per the build order below):

- `src/runtime/node/node-runtime.ts` — stdin/stdout via `node:readline/promises`. Backs the CLI.
- `src/runtime/browser/browser-runtime.ts` — framework-agnostic, driven by callback hooks. Backed
  by `web/src/engine/useBrowserRuntime.ts` for the React UI.
- `tests/helpers/test-runtime.ts` — in-memory, captures print output, replays scripted stdin.
  Backs both colocated unit tests and golden-file tests.

## Type-suffix semantics

BASIC's `%`/`!`/`#`/`$` suffixes are tracked in the AST (`TypeSuffix` in `src/ast/types.ts`) and
enforced **at assignment time** (`LET`, `FOR` loop-variable update, `READ`, `INPUT`, array-element
store), not on every intermediate expression — matching real BASIC. Coercion helpers live in
`src/runtime/shared/values.ts`. All BASIC _syntax_ (keywords, identifiers) is case-insensitive and
normalized; string _literal contents_ are never touched by that normalization. Full semantics are
in [DIALECT.md](DIALECT.md).

## Conventions

- **Many small, single-responsibility files over few large ones.** This applies everywhere: the
  AST is split by node category (`ast/statements.ts`, `ast/expressions.ts`, ...), the parser and
  emitter are split by concern (`parse-statements.ts`/`parse-expressions.ts`,
  `emit-statements.ts`/`emit-expressions.ts`), and the web UI is one component + one CSS module
  per directory under `web/src/components/`. When in doubt, split further rather than adding a
  second responsibility to an existing file.
- **Exhaustiveness on every AST-kind `switch`.** Every `switch` over a `Statement['kind']` or
  `Expression['kind']` (in the analyzer, lowering, and emitter) must end with a `default` case
  calling an `assertNever(x: never)` helper, so adding a new AST node kind without updating every
  consumer is a **compile error**, not a silent runtime bug.
- **Strict TypeScript, no unjustified `any`.**
- **Relative imports in `src/**`/`tests/**` need an explicit `.js` extension** (e.g.
  `import { tokenize } from "./lexer.js"` even though the file is `lexer.ts`) — the root
  `tsconfig.json` uses `NodeNext` module resolution, which requires this. `web/**` uses Vite's
  `Bundler` resolution instead and does not need it.
- **Colocated unit tests, cross-cutting golden tests.** `src/lexer/lexer.test.ts` sits next to
  `lexer.ts`; full end-to-end sample programs live under `tests/golden/programs/`. See "Testing"
  below.

## UI replaceability contract

The web UI ([web/](web/)) is a React + Vite + TypeScript app deliberately structured so it can be
redesigned — or even rewritten in a different framework — without touching the compiler core:

- `web/src/engine/` is the **only** bridge between the UI and the compiler core (`src/index.ts`'s
  `compile()`, plus `BrowserRuntime`). It contains no JSX and no styling.
- Every visual piece is its own component folder under `web/src/components/`
  (`ComponentName.tsx` + `ComponentName.module.css`), never a shared giant stylesheet.
- `web/src/styles/tokens.css` centralizes the design language (colors, spacing, type scale) as CSS
  custom properties — component stylesheets reference these variables rather than hardcoding
  values, so a reskin-only revision can often be just a `tokens.css` edit.
- A future full redesign only requires rewriting `web/src/components/**` and `web/src/App.tsx`
  against the same `engine/` contract; `src/**` (the compiler core) and the CLI are unaffected.

Deployed as a static site on **Vercel** (see [vercel.json](vercel.json) — zero-config Vite
detection, no server/API routes needed since everything runs client-side).

## Future: multiple language pairs

This is intentionally a focused BASIC→JS tool, not a generic framework, but the module boundaries
(`lexer` / `parser` / `ast` / `emitter` / `runtime`, all feeding a shared-shaped `Step[]` IR) are
already clean enough that a second language pair would not require a rewrite. If/when that
happens, the documented migration is: move the BASIC-specific modules to
`src/languages/basic/{lexer,parser,ast}`, add a sibling `src/languages/<lang>/`, and keep
`src/ir/`, `src/runtime/interface.ts`, and the CLI shell shared. Do not build this abstraction
preemptively — only generalize once a second language pair is actually being added.

## Dev commands

```bash
npm install                 # install core + web workspace deps
npm run build                # compile src/ -> dist/ (tsconfig.build.json)
npm run typecheck            # tsc --noEmit across src/ + tests/
npm test                     # vitest run (colocated unit + tests/golden)
npm run test:watch           # vitest watch mode
npm run lint                 # eslint .
npm run format                # prettier --write .
npm run web:dev               # vite dev server for web/
npm run web:build              # production build of web/ -> web/dist
node dist/cli/index.js run examples/fizzbuzz.bas   # after building; or `npx tsx src/cli/index.ts run ...` during dev
```

## How to add a new BASIC statement

1. Add the keyword to `src/lexer/keywords.ts` if it isn't already recognized.
2. Add its AST shape to `src/ast/statements.ts` (extend the `Statement` union).
3. Add a parse function in `src/parser/parse-statements.ts` + parser unit tests.
4. Add lowering logic in `src/ir/lower-statements.ts` if it affects jump targets or step
   flattening (most statements do, since each becomes its own `Step`).
5. Add emission logic in `src/emitter/emit-statements.ts`.
6. Add runtime support helpers in `src/runtime/shared/` if needed.
7. Add emitter/behavioral unit tests — compile a small snippet and execute the emitted code
   against `tests/helpers/test-runtime.ts`'s `TestRuntime`, asserting on captured output/state.
8. Extend an existing golden program or add a new one under `tests/golden/programs/`.
9. Document the statement's exact syntax/semantics in [DIALECT.md](DIALECT.md).

## How to add a new builtin function

Narrower version of the above, scoped to `src/emitter/runtime-calls.ts` (name → runtime helper
mapping) + the relevant file under `src/runtime/shared/` (`strings.ts`, `math.ts`, or
`formatting.ts`) + its unit tests + a DIALECT.md entry in the function table.

## Staged build order

The compiler is built incrementally so there's a working end-to-end path early. Full detail is in
the scaffolding plan (git history); summary:

1. Minimal lexer (line numbers, `PRINT`, `LET`, literals, identifiers+suffixes, `GOTO`, arithmetic,
   colon, `REM`) + tests.
2. AST + parser for that subset + tests.
3. Lowering (`Program → Step[] + lineToStep`) for the linear/GOTO-only subset.
4. Emitter producing the async trampoline for that subset.
5. Minimal `NodeRuntime` + CLI `run` → **first end-to-end milestone**: a PRINT/LET/GOTO program
   runs correctly. Get this solid (including a GOTO-loop-with-counter golden test) before
   expanding scope.
6. `IF`/`THEN`/`ELSE` + full operator precedence.
7. `FOR`/`NEXT` with `STEP` (runtime stack semantics).
8. `GOSUB`/`RETURN`, `ON GOTO`/`ON GOSUB`.
9. `INPUT` (async suspension) + readline-based `NodeRuntime` input.
10. `DIM` + array l-values/bounds.
11. `DATA`/`READ`/`RESTORE`.
12. `WHILE`/`WEND`.
13. `DEF FN`.
14. Full builtin library, with edge-case unit tests.
15. Type-suffix enforcement (compile-time + runtime coercion/overflow).
16. Error-handling polish + compile-time undefined-line-target validation.
17. `BrowserRuntime` + the `web/` React+Vite app (component scaffold, `engine/` adapter layer,
    deploy to Vercel).
18. Golden programs added incrementally as features land — not batched at the end.
19. CLI polish (`--standalone`, `--emit-ast`, `--emit-steps`, help text, exit codes).
20. Final docs pass.

Every `src/**` file not yet reached by this build order is a stub with a `TODO` comment pointing at
the relevant step above — that's the intended landing spot for each piece of real implementation.

**Progress**: steps 1–2 are implemented.

- Step 1 (minimal lexer) — `src/lexer/{token,keywords,lex-error,lexer}.ts` + colocated `lexer.test.ts`.
  It's dialect-complete on the keyword/operator table (a lookup table costs nothing to fill in
  early) even though only a subset has a parser yet.
- Step 2 (AST + parser) — `src/ast/{types,expressions,statements,program,index}.ts` define the full
  node-shape reference for every statement/expression kind (again, cheap to fill in as types now);
  `src/parser/{errors,token-cursor,token-value,identifier,precedence,parse-expressions,parse-statements,parser}.ts`
  implement parsing for PRINT, LET (explicit and implicit assignment), GOTO, REM/`'` comments, END,
  and STOP, plus full arithmetic-expression precedence (unary `-`, `^`, `* / \`, `MOD`, `+ -`,
  parenthesized grouping). Every other keyword the lexer recognizes raises a clear "not implemented
  yet" `ParseError` naming the keyword, rather than being silently mis-parsed. `src/util/assert-never.ts`
  is in place for the exhaustiveness convention, ready for step 3's lowering to start using it.

- Step 3 (lowering) — `src/ir/program.ts` defines `Step` (currently `Print`/`Let`/`Goto`/`NoOp`/`Halt`,
  one per supported statement kind — deliberately _not_ pre-designed for IF/FOR/GOSUB/WHILE the way
  the AST/keyword tables were, since those need real runtime-stack semantics that aren't validated
  yet) and `LineIndex`/`LoweredProgram`. `src/ir/lower-statements.ts` lowers each supported
  statement 1:1 into a Step, with explicit throwing cases (backed by `assertNever`) for every other
  Statement kind as a defensive backstop. `src/ir/lowering.ts`'s `lower(program)` flattens all lines
  into one contiguous `Step[]` and builds `lineToStep`. Key finding baked into the design: `GotoStep`
  carries the raw, _unresolved_ BASIC line number — lowering never needs to solve forward references,
  because empty lines and jump targets both naturally resolve via `lineToStep` at emission time (or
  a `LINESTART`-style table in the emitted JS itself, per the plan's illustrative shape).

- Step 4 (emitter) — `src/emitter/{mangle,emit-expressions,emit-print,emit-statements,emit-program,prelude}.ts`
  turn a `LoweredProgram` into a self-contained JS ES module exporting `async function run(rt)`.
  Key findings: (1) every switch case needs its own `{ }` block, since `let`/`const` declared
  directly under a bare `case` in JS is scoped to the _whole_ switch, not just that case, and
  would collide across the many `Print` cases a real program emits; (2) JS's `%` turned out to
  already match GW-BASIC's documented `MOD` behavior exactly (both are truncating-division
  remainder, sign-of-dividend) — corrected DIALECT.md, which had originally (incorrectly) assumed
  a mismatch; (3) PRINT's number formatting/comma tab-zones needed a couple of small `__`-prefixed
  helpers inlined via `prelude.ts`, with an honestly-documented simplification (tab-zone column
  tracking resets every statement, not tracked across a whole program) flagged in DIALECT.md's
  Open Decisions. Found and fixed a real step-2 parser bug while building this: `PRINT 1 2` (two
  values with no separator) was silently accepted as two adjacent value segments instead of being
  a parse error.
- Step 5 (minimal runtime + CLI) — `src/runtime/interface.ts` (`BasicRuntime`), `src/runtime/node/node-runtime.ts`
  (`NodeRuntime`), `tests/helpers/test-runtime.ts` (`TestRuntime`), `src/index.ts` (public `compile()`),
  `src/util/load-js-module.ts` (executes emitted JS text via a `data:` URL dynamic `import()`, no
  temp files needed), and `src/cli/{index,commands/run,commands/convert}.ts`. **First end-to-end
  milestone reached**: `basic2js run <file.bas>` and `node dist/cli/index.js run <file.bas>` both
  correctly compile and execute a real PRINT/LET/GOTO program. The real golden-test harness
  (`tests/golden/golden.test.ts`) replaced its `it.todo` stub and now auto-discovers any
  `programs/*/program.bas`; added `tests/golden/programs/goto-basics/` (LET/PRINT/arithmetic +
  forward _and_ backward GOTO, verified against the actual compiler output rather than
  hand-computed). Note: a _self-terminating_ GOTO-driven counting loop isn't achievable yet —
  looping requires a conditional to escape, and `IF`/`THEN` doesn't exist until step 6 — so
  `goto-basics` demonstrates backward-jump correctness via an unconditional jump straight into an
  `END`, not a true bounded loop; a real counting-loop golden test should be added once step 6 lands.

- Step 6 (`IF`/`THEN`/`ELSE` + full precedence) — `src/parser/precedence.ts` now has the complete
  table (comparisons at one level, `AND`/`OR` below, `NOT`'s virtual unary precedence between the
  two). `src/ir/program.ts` gained `JumpTarget` (`{line}` resolved via `LINESTART` at runtime,
  `{step}` a literal index computed during lowering, `{halt}` for "no next line exists") and
  `IfStep`; `GotoStep.target` was generalized from a raw number to a `JumpTarget` for consistency.
  `src/ir/lower-statements.ts`'s `lowerIfStmt` flattens THEN/ELSE branches into steps immediately
  following the `IfStep`, inserting a skip-jump only when _both_ branches are inline statement
  lists (otherwise nothing needs skipping over) — worked out from first principles and verified by
  19 lowering tests before ever running emitted code. `src/emitter/emit-jump-target.ts` centralizes
  `JumpTarget → JS` for both `Goto` and `If`; comparisons emit `? -1 : 0` (classic BASIC's numeric
  TRUE/FALSE) and `AND`/`OR`/`NOT` emit JS's bitwise `& | ~` (matching BASIC's "operate on
  numeric-truthiness" semantics, not JS's logical `&& || !`). Two real parser bugs found and fixed
  while wiring this up: PRINT didn't know to stop before a bare `ELSE` keyword when inside an IF
  branch, and (from step 4) nothing had yet exercised `IF` deeply enough to catch it. `goto-basics`
  and a new `fizzbuzz` golden program (GOTO/IF-based, since `FOR`/`NEXT` isn't implemented yet) both
  pass; the counting-loop golden test deferred at step 5 is now a real behavioral test.

- Step 7 (`FOR`/`NEXT` with `STEP`) — `ForStep` needs no explicit "body start" field: by
  construction it's always `stepIndex + 1`, the same trivially-known value every other step kind
  already uses for normal fallthrough. The runtime `forStack` lives in `run()`'s closure (pushed by
  `ForStep`, popped/tested by `NextStep` via a shared `__nextFor` prelude helper, since PRELUDE
  functions sit outside `run()`'s closure and need `V`/`forStack` passed in explicitly). A
  multi-variable `NEXT I, J` lowers to two independent `NextStep`s rather than one step closing two
  frames atomically — simpler, and matches treating it as shorthand for consecutive single-variable
  `NEXT`s (see DIALECT.md). Confirmed by direct experimentation (not just reasoning) that classic
  BASIC's `FOR` does **not** pre-test the loop condition — `FOR I = 1 TO 0` still runs the body once,
  only `NEXT` ever checks whether to continue — and that `start`/`end`/`step` must all be evaluated
  using the loop variable's pre-loop value before it gets reassigned (`FOR I = 1 TO I * 2` needs I's
  old value for the bound). `fizzbuzz`'s golden program was rewritten to use real `FOR`/`NEXT`
  instead of its step-6 GOTO/IF workaround, with identical output confirming both approaches agree.

- Step 8 (`GOSUB`/`RETURN`, `ON GOTO`/`ON GOSUB`) — mirrors `FOR`'s "no explicit body-start field
  needed" trick: `GosubStep`'s return address is always `stepIndex + 1`, computed at emission time
  rather than stored. A runtime `gosubStack` (parallel to `forStack`) lives in `run()`'s closure;
  `__return` (a new prelude helper) pops it and throws `RETURN WITHOUT GOSUB` on empty. `OnJumpStep`
  reuses `JumpTarget`/`emitJumpTarget` for each of its targets and a small `__onJumpTarget` prelude
  helper (truncate-and-1-index, returning `null` for out-of-range) to decide the destination;
  `ON...GOTO` vs. `ON...GOSUB` is a compile-time branch in the emitter (whether to also push a
  return address), not a runtime one — and critically, an out-of-range `ON...GOSUB` selector pushes
  nothing at all, so a stray subsequent `RETURN` still correctly errors instead of jumping somewhere
  bogus (verified with a dedicated test). All of this validated first via a throwaway smoke script
  (nested GOSUB, `ON...GOTO`/`ON...GOSUB` with in-range and out-of-range selectors, `RETURN WITHOUT
GOSUB`) before formal tests were written, same workflow as step 7.

- Step 9 (`INPUT` + readline `NodeRuntime` input) — `InputStep` is the second (after `Print`)
  case body that ever `await`s. Prompt text (`"prompt? "` / `"prompt"` / bare `"? "`, per whether a
  custom prompt was given and whether it was followed by `;` or `,`) is fully resolved to one string
  at **emission** time, not left as a runtime concern. **Real bug found and fixed**: `NodeRuntime`
  originally used `readline/promises`' `.question()`, but direct experimentation (`echo "a\nb" | ...`)
  showed a second sequential `await rl.question(...)` call never resolves when stdin is a non-TTY
  pipe and both lines arrive in the same underlying chunk — readline buffers the second line
  internally before the second `.question()`'s listener exists to receive it. This isn't a
  hypothetical edge case: `basic2js run program.bas < input.txt` is an entirely ordinary way to run
  a program non-interactively, and multi-`INPUT` programs are common. Fixed by driving the plain
  `readline.Interface` via its async iterator instead, which reads buffered lines correctly
  regardless of chunking. `tests/golden/programs/temp-converter/` filled in (was a placeholder).

- Step 10 (`DIM` + array l-values/bounds) — arrays are represented at runtime as one flat
  `{ dims, data }` object per array (a manually computed linear index), not nested arrays, so 1D/2D
  access share the same indexing helper (`__arrIndex`) regardless of dimension count. An array
  that's never explicitly `DIM`'d is lazily allocated at size 10 per dimension on first access
  (`__arrEnsure`), matching classic BASIC. `identifier(args)` in expression position is now always
  parsed as `ArrayRef` (previously it fell through to a "leftover `(`" parse error) — correct for
  now since builtins (step 14) and `DEF FN` (step 13) don't exist yet to create ambiguity; flagged
  with an explicit TODO for real disambiguation once they land. `LetStep`'s emission had to branch
  on `target.kind` for the first time (`V[...] = ...` vs. `__arrSet(...)`) since `LValue` has always
  allowed `ArrayElement`, even though nothing produced one until this step — a reminder that a type
  allowing something and the code handling it correctly are two different guarantees.
  `tests/golden/programs/bubble-sort/` filled in (was a placeholder), output cross-checked against
  Python's `sorted()`.

Next: step 11, `DATA`/`READ`/`RESTORE`.
