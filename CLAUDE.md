# CLAUDE.md

Guidance for Claude Code (and any other agent or contributor) working in this repository.

## What this project is

`basic2js` converts classic line-numbered BASIC (GW-BASIC/Applesoft/Dartmouth style — see
[DIALECT.md](DIALECT.md) for the exact supported syntax) into JavaScript that behaves **1:1**
with the original program, including full support for unstructured `GOTO`/`GOSUB` control flow.
It ships as a Node.js CLI (`basic2js convert`, `basic2js run`) and a small web UI
([web/](web/), deployed to Vercel). Two BASIC dialects are supported (`src/dialect.ts`): the
default `"classic"` spec, and `"gwbasic"`, which adds GW-BASIC's sequential file I/O
(`OPEN`/`CLOSE`/`PRINT #`/`INPUT #`/`EOF()`) — see DIALECT.md's "GW-BASIC dialect extension"
section and this file's "Progress" notes for how dialect selection threads through the pipeline.

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
this interface, never to `process.stdout`/DOM/etc. directly. Three implementations exist:

- `src/runtime/node/node-runtime.ts` — stdin/stdout via plain `node:readline` (not
  `readline/promises` — see its own header comment for why), driven via its async iterator. Backs
  the CLI.
- `src/runtime/browser/browser-runtime.ts` — framework-agnostic, driven by callback hooks. Backed
  by `web/src/engine/useBrowserRuntime.ts` for the React UI.
- `tests/helpers/test-runtime.ts` — in-memory, captures print output, replays scripted stdin.
  Backs both colocated unit tests and golden-file tests.

## Type-suffix semantics

BASIC's `%`/`!`/`#`/`$` suffixes are tracked in the AST (`TypeSuffix` in `src/ast/types.ts`) and
enforced **at assignment time** (`LET`, `FOR` loop-variable update, `READ`, `INPUT`, array-element
store), not on every intermediate expression — matching real BASIC. Runtime coercion helpers
(`__toInt`/`__toStr`) live in `src/emitter/prelude.ts`, wired up via `src/emitter/coerce.ts` —
`src/runtime/shared/values.ts` stayed a documented stub (see its header comment) rather than
growing an unused second copy, the same call step 14 made for the pure/stateless string/math
builtins. Compile-time mismatch checking lives in `src/semantics/analyzer.ts`, using
`src/ast/infer-type.ts`'s shared type-inference helper. All BASIC _syntax_ (keywords, identifiers)
is case-insensitive and normalized; string _literal contents_ are never touched by that
normalization. Full semantics are in [DIALECT.md](DIALECT.md).

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
- **Colocated unit tests, cross-cutting golden tests, integration tests for cross-process
  behavior.** `src/lexer/lexer.test.ts` sits next to `lexer.ts`; full end-to-end sample programs
  live under `tests/golden/programs/` (auto-discovered by `tests/golden/golden.test.ts`); anything
  that genuinely needs a separate process (`tests/cli.test.ts`'s exit-code and `--standalone`
  checks) also lives under `tests/`. See CONTRIBUTING.md for how to add each kind.

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
node dist/cli/index.js run tests/golden/programs/fizzbuzz/program.bas   # after building; or `npx tsx src/cli/index.ts run ...` during dev
node dist/cli/index.js run program.bas --emit-ast      # debug: dump the parsed AST as JSON
node dist/cli/index.js run program.bas --emit-steps    # debug: dump the lowered Step[] as JSON
node dist/cli/index.js convert program.bas --standalone -o out.js && node out.js   # no basic2js install needed to run out.js
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

If the statement is dialect-specific (only legal under `"gwbasic"`, say — see `src/dialect.ts`),
gate it in the parser, not the lexer: keep the keyword unconditionally recognized by the lexer, and
call `requireGwBasic(cursor, token, "FEATURE NAME")` (`src/parser/parse-statements.ts`) at the
parse function's entry point instead. This gives a classic-dialect program using it one clear
"X is a GW-BASIC dialect extension" error rather than a confusing generic syntax error — see
DIALECT.md's "GW-BASIC dialect extension" section for the precedent.

## How to add a new builtin function

Narrower version of the above:

1. Add the name + arity to `src/parser/builtins.ts`'s `BUILTIN_FUNCTIONS` registry.
2. Add a matching entry to `src/emitter/runtime-calls.ts`'s `RUNTIME_CALLS` (name → JS-emission
   function) — `runtime-calls.test.ts` asserts the two tables' key sets stay identical, so a
   builtin added to one and forgotten in the other is caught immediately.
3. If the logic needs more than a one-line `Math.*`/inline expression, add a `__`-prefixed helper
   directly to `src/emitter/prelude.ts` (**not** `src/runtime/shared/strings.ts`/`math.ts` — see
   their header comments for why pure/stateless builtins live in `prelude.ts` as embedded JS text
   instead of a TS module: nothing outside emitted code ever calls them, so a second copy would
   only be a duplication/drift risk). `src/runtime/shared/random.ts` is the one exception — `RND`/
   `RANDOMIZE` genuinely need the `BasicRuntime` host for entropy, so that logic really does live
   in a real, host-shared TS module.
4. Add behavioral tests in `src/emitter/emit-program.test.ts` (compile a snippet, run it against
   `TestRuntime`, assert on output/errors — covers edge cases too, e.g. `SQR` of a negative
   number).
5. Add a DIALECT.md entry in the relevant builtin-function table.

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

All 20 steps are now implemented — see "Progress" below for exactly what landed at each one,
including real bugs found and design decisions made along the way. A handful of files scaffolded
early turned out to stay intentionally empty once their real step arrived (`src/ir/lower-expressions.ts`,
`src/semantics/symbol-table.ts`, `src/runtime/shared/{strings,math,values,formatting}.ts`) — each
has its own header comment explaining why the anticipated need never materialized, rather than a
stale `TODO`.

**Progress**: steps 1–20 are implemented (see "GW-BASIC dialect extension" at the end of this
section for the follow-on feature work that began once the 20-step build order itself completed).

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

- Step 11 (`DATA`/`READ`/`RESTORE`) — the pre-pass (`lowering.ts`'s `collectData`) recurses into
  `IfStmt` branches, not just each line's top-level statements, since a `DATA` nested inside a
  `THEN`/`ELSE` clause is unusual but grammatically legal. `DataStmt` lowers to zero Steps (it's
  non-executable); `DATA`/`DATA_LINE_STARTS` are emitted as module-level `const`s alongside
  `LINESTART` (purely derived from the source program, identical across every `run()` call, unlike
  the per-invocation `V`/`ARR`/`forStack`/`gosubStack`), so `dataPtr++` inside a `Read` case body
  needs no parameter-passing — direct closure/module-scope access, same reasoning already proven
  for `LINESTART`. `__readNext(dataPtr++)`'s post-increment argument does the bounds-check-then-
  advance in one expression, no separate increment statement. Scoped `DATA` values down to numbers
  and quoted strings only (documented as an Open Decision) rather than also supporting real BASIC's
  unquoted bare-word data, since the lexer already lowercases identifier-shaped tokens at tokenize
  time with no way to know a DATA value shouldn't be case-normalized.

  **Real bug found while writing the `prime-sieve` golden program** (not a step-11 bug, but only
  surfaced once DATA/READ's neighboring golden-program work prompted filling in the array-based
  goldens deferred from step 10): `FOR J = I*I TO N STEP I` inside a sieve, when `I*I` already
  exceeds `N`, still runs its body once — because FOR doesn't pre-test (see step 7's finding) — and
  `J = I*I` can be out of the DIM'd array's bounds, raising `SUBSCRIPT OUT OF RANGE`. Fixed by
  guarding with `IF I*I > N THEN <skip>` before entering the inner loop, a real pattern classic
  BASIC programs need for exactly this reason. `tests/golden/programs/{data-read-demo,prime-sieve}/`
  both filled in (were placeholders) — `bubble-sort`/`fizzbuzz`/`temp-converter` had already
  unblocked the array/FOR-based ones early, so only `guess-number` (needs `RND`, step 14) remains.

- Step 12 (`WHILE`/`WEND`) — the one construct so far whose target isn't knowable at the moment
  it's lowered: a `WHILE`'s "jump past the loop" target depends on where its matching `WEND` ends
  up, which may be many lines later and not yet lowered. Solved with a two-phase approach: `WhileStmt`/
  `WendStmt` lower through the normal `lowerStatement` flow like everything else (so they interleave
  correctly with `IF` branches, colon-separated statements, etc., for free) into steps carrying a
  shared `UNRESOLVED_WHILE_WEND` placeholder target; a new `resolveWhileWend` pass in `lowering.ts`
  then walks the _fully flattened_ `Step[]` once more with a stack, matching pairs like parentheses
  and patching in real `{ kind: "step" }` targets — by construction this also correctly matches a
  `WHILE`/`WEND` pair that ends up split across an `IF` branch and the top level, with zero special
  -casing, since it only cares about the final flat sequence, not how it was assembled. A mismatched
  pair throws during lowering — a genuine compile-time error for a structural defect, not a runtime
  one. Confirmed by direct experimentation that `WHILE` (unlike `FOR`) _does_ pre-test its condition.

- Step 13 (`DEF FN`) — required a space between `FN` and the function name (`DEF FN A(X) = ...`,
  not concatenated `DEF FNA(X) = ...`) so `FN` always lexes as its own `Keyword` token; as a bonus
  this makes `FN name(...)` call expressions unambiguous with `ArrayRef` at parse time with zero
  disambiguation logic needed (a call is always `FN`-keyword-prefixed, an array reference never
  is) — real disambiguation is still deferred to step 14 for builtins, which have no such marker.
  `parseIndexList` (shared with `ArrayRef`/`DimStmt`) had to be relaxed to allow zero arguments,
  since `FN PI()` is legal but no existing caller needed an empty list before. `DEF FN` is
  non-executable (lowers to zero Steps, mirroring `DataStmt`) and is instead collected by a new
  `lowering.ts` pre-pass (`collectFnDefs`, recursing into `IfStmt` branches like `collectData`)
  into `LoweredProgram.fnDefs`, keyed by `name + suffix` — so a function can be called before its
  textual `DEF FN` line ever executes, the same hoisting-like guarantee `DATA`/`READ` already rely
  on. Emission (`emit-fn-defs.ts`) turns each entry into a real JS function assigned into a new
  `FN` object declared inside `run()`'s closure (not module-level like `LINESTART`/`DATA`, since a
  function body can read the caller's live `V`/`ARR` state) — each `DEF FN` parameter becomes a
  real JS function parameter (mangled via a new `mangleParamName` in `mangle.ts`), so JS's own
  function-scoping makes a parameter shadow a same-named global for the call's duration with no
  bespoke mechanism, while `emitExpression` gained an optional `locals: ReadonlySet<string>`
  parameter threaded through its recursive helpers so a `VariableRef` matching a parameter
  resolves to that JS parameter instead of a `V[...]` lookup.

  **Real bug found and fixed**: adding that second, optional `locals` parameter to `emitExpression`
  silently broke four bare `.map(emitExpression)` call sites (`emit-input.ts`, `emit-read.ts`, two
  in `emit-statements.ts`) — `Array.prototype.map` invokes its callback as `(value, index, array)`,
  so the numeric `index` landed in `locals` at every one of those sites, and `locals.has(...)` threw
  `TypeError` at runtime for any array/input/DIM expression containing a `VariableRef`. Caught by
  running the full suite after the change (219/221, with the 2 failures being expected removals —
  see below) rather than by reasoning about it in advance; fixed by wrapping each site in an
  explicit arrow function. `emitJumpTarget`'s bare `.map()` use was unaffected since its signature
  takes only one parameter, so JS simply ignores `.map()`'s extra arguments there. Take-away
  documented in `emit-expressions.ts`: adding an optional parameter to a function used as a bare
  `.map()`/`.forEach()` callback anywhere is a latent multi-call-site bug, not just a local one —
  worth an explicit search across the codebase, not just fixing the call site you're looking at.

  With DEF FN implemented, every keyword the step-13 parser previously rejected with "not
  implemented yet" is now a real statement — no unimplemented keyword remains to exercise that
  fallback branch, so the corresponding placeholder tests in `parser.test.ts` and
  `lowering.test.ts` (which had been incrementally re-targeted at whichever keyword was still
  unimplemented across steps 7–13: `FOR` → `GOSUB` → `WHILE` → `DEF`) were removed rather than
  re-targeted again, replaced with a comment explaining why.

- Step 14 (full builtin function library) — the parser's `identifier(` ArrayRef-vs-call ambiguity
  (flagged as a TODO back in step 10) is resolved by a new `src/parser/builtins.ts` name/arity
  registry: a bare (non-`FN`-prefixed) `identifier(` matching a registry entry parses as a
  `CallExpr` with an arity check right there at parse time (so `LEFT$("X")` fails immediately with
  a clear "LEFT$ expects 2 arguments, got 1" `ParseError`, never a runtime surprise); anything else
  still parses as `ArrayRef`, unchanged. Builtin names are deliberately reserved **only in call
  position** (see DIALECT.md's Open Decisions) — a bare identifier with the same spelling and no
  following `(` is still an ordinary variable, keeping the change scoped to the existing decision
  point instead of requiring a symbol-table pass. Emission reuses the exact same "which case is
  this" trick step 13 already established for `CallExpr` (an emitted `FN[key](...)` vs. something
  else): a new `src/emitter/runtime-calls.ts` RUNTIME_CALLS table (name → JS-emission function) is
  checked first; a match means "builtin", anything else falls back to `FN[...]`. A
  `runtime-calls.test.ts` asserts `RUNTIME_CALLS`'s keys exactly match `builtins.ts`'s, so a new
  builtin can't be added to the parser's registry and forgotten in the emitter's (or vice versa).

  `TAB(col)`/`SPC(n)` are handled entirely differently from the other builtins: real classic BASIC
  restricts them to PRINT's argument list (not general expressions), so they're recognized by a
  dedicated `tryParseTabOrSpc` check inside `parsePrintStmt` itself (two new `PrintSegment` kinds,
  `"tab"`/`"spc"`) rather than going through `builtins.ts`/`CallExpr` at all — consistent with real
  BASIC's own scoping, and avoids reserving those two names globally for zero benefit.

  Most builtins route through a new `__`-prefixed PRELUDE helper (`__left`/`__right`/`__mid`/
  `__chr`/`__asc`/`__str`/`__val`/`__instr`/`__sqr`/`__sgn`/`__tabTo`/`__spc`), following the exact
  established pattern from every prior step's control-flow/array/DATA helpers; `INT`/`ABS`/`SIN`/
  `COS`/`TAN` are simple enough to emit a bare `Math.*` call directly, no helper needed. `RND` is
  the one builtin that reaches outside pure JS, emitting `rt.random()` directly — real entropy has
  to come from the host, not from stateless emitted code, mirroring how `INPUT` already needed the
  host for user input. This meant `RANDOMIZE seed` also needed to become a real statement in this
  step (not originally itemized in the build-order title, but required for `RND` to be testable at
  all — `src/runtime/interface.ts`'s `seedRandom`/`random` were declared back in step 5 explicitly
  for this): a new `RandomizeStmt`/`RandomizeStep`, lowering/emitting through the exact same
  pattern as every other single-step statement, calling the synchronous `rt.seedRandom(seed)`.
  `src/runtime/shared/random.ts` gained a real mulberry32-based `SeedableRandom`, shared by
  `NodeRuntime` (wall-clock-seeded by default) and `TestRuntime` (fixed-seed by default, so an
  accidentally-unseeded test fails the same way every run instead of flaking) — the one
  `runtime/shared/*.ts` file that actually needed real logic, since RND/RANDOMIZE genuinely route
  through the `BasicRuntime` host interface. `strings.ts`/`math.ts`/`formatting.ts` deliberately
  stayed stubs: their builtins are pure and stateless, needed by nothing outside emitted code, so a
  second TS copy of logic that's really only ever expressed once (in PRELUDE) would just be a
  duplication/drift risk with no payoff — their header comments now say so explicitly rather than
  leaving a stale "TODO, unimplemented" impression.

  **Real bug found and fixed** (caught by direct smoke-testing before formal tests, not by
  reasoning about it in advance): `VAL("  42.5xyz")` was returning `0` instead of `42.5`. Root
  cause: PRELUDE is itself one big JS template literal (`prelude.ts`'s `export const PRELUDE =
\`...\``), so a regex pattern written with plain single backslashes (`\d`, `\.`) inside that
template literal gets its backslashes silently eaten by prelude.ts's own template-literal
parsing before the text ever reaches the emitted PRELUDE string — `\d`arrives in emitted output
as a bare`d`, matching the literal letter instead of any digit. Fixed by doubling every
backslash in `__val`'s regex (`\\d`, `\\.`); documented prominently in prelude.ts's header
  comment as a standing hazard for anyone adding a future regex-based helper here.

  Filled in `tests/golden/programs/guess-number/` (a number-guessing game using `RND`/`RANDOMIZE`
  and `INT()`, deferred since step 9 pending `RND`) — the last remaining golden-program placeholder
  (build order step 18's item), so step 18 is now also fully done, incrementally, per its own
  "not batched at the end" instruction. Its scripted guess sequence was derived by first running
  the compiled program to reveal the seeded target number, then hand-computing a binary-search
  guess path to it, then generating `expected.txt` from an actual compiler run (never
  hand-computed) — same verified-against-the-real-compiler workflow as every other golden program.

- Step 15 (type-suffix enforcement) — the pipeline gained its first real `src/semantics/` stage:
  `analyzer.ts`'s `analyze(program): Diagnostic[]` runs after parsing, before lowering. A
  key finding that simplified the whole step: BASIC's `%`/`!`/`#`/`$` suffix is part of an
  identifier's own spelling (`A`/`A%`/`A$` are three distinct variables — see DIALECT.md), so
  every check site's type is already fully recoverable locally, with **no symbol table needed** —
  `symbol-table.ts`'s originally-sketched stub stayed a stub, its header comment now explaining
  why. The actual type-inference logic (`ast/infer-type.ts`'s `inferExpressionType`) was extracted
  from `emit-print.ts`'s pre-existing local `inferValueType` heuristic into a new shared
  `src/ast/` module — both the analyzer and the emitter need exactly the same "what type does this
  expression produce" answer, so this lives at the one layer they both already depend on rather
  than either depending on the other or duplicating the logic. `compile()` (`src/index.ts`) throws
  a new `SemanticError` (`semantics/semantic-error.ts`) when `analyze()` finds any diagnostics,
  aggregating all of them into one message — a deliberate departure from `CompileResult`'s original
  step-5-era TODO comment, which had sketched a non-throwing `diagnostics: Diagnostic[]` field:
  proceeding to lower/emit a program known to misbehave isn't better than refusing to compile, the
  same way a syntax error already isn't, and throwing meant the CLI needed **zero** changes (its
  existing generic `catch (err) { console.error(...); exitCode = 1; }` in both commands already
  handles any thrown `Error` uniformly — verified end-to-end via the built CLI).

  Runtime coercion (the other half of "compile-time + runtime coercion/overflow") followed the
  same "logic lives in prelude.ts, not a src/runtime/shared/*.ts TS mirror" pattern step 14
  established for the pure/stateless builtins: two new prelude helpers, `__toInt` (round-half-
  away-from-zero — **not** JS's native `Math.round`, which rounds half toward `+Infinity` and
  would give `-2` instead of BASIC's `-3` for `Math.round(-2.5)` — then range-checked against
  `[-32768, 32767]`, throwing `OVERFLOW` if out of range) and `__toStr` (type-checks the value is
  actually a string, throwing `TYPE MISMATCH` if not). A new `emit-statements.ts`-and-`emit-read.ts`
  -shared `coerce.ts` wraps a value expression's emitted JS with the right helper call based on the
  target's suffix (`!`/`#`/no-suffix need no wrapping — plain `number` passthroughs). Wired into
  all five assignment sites DIALECT.md names: `LET` (scalar and array-element), `FOR`'s initial
  assignment _and_ every `NEXT`'s increment (the `forStack` frame now carries an `isInt` flag so a
  `%`-suffixed loop variable stays valid across the whole loop, not just its first iteration),
  `READ`, and `INPUT` (whose existing `__inputCoerce` helper gained a `suffix` parameter — replacing
  its old boolean `isString` — so a `%`-suffixed target's parsed number also gets `__toInt`'s
  round+overflow treatment on top of the pre-existing "malformed input → 0" simplification, which
  stays exactly as before per DIALECT.md's Open Decisions).

  **Real bug found and fixed** (caught by direct smoke-testing before formal tests, not by
  reasoning about it in advance): `FOR I% = 1 TO 3: NEXT I%` raised a spurious `NEXT WITHOUT FOR`.
  Root cause: `parseNextStmt` was stripping a named `NEXT` variable's type suffix
  (`splitSuffix(...).name`), so the stored variable string ("i") never matched a `ForStep`'s
  `varKey`-formatted frame key ("i%") — `__nextFor`'s `frame.key === variable` lookup always
  failed for any suffixed loop variable explicitly named in its `NEXT`. This bug predates step 15
  (it's a step-7/13-era parser bug, not something step 15's changes introduced) but had never
  surfaced before, since no prior golden program or test used a suffixed loop variable together
  with an explicit `NEXT <var>`. Fixed by keeping the full name+suffix spelling.

  DIM's array-size expressions, `IF`/`WHILE` conditions, `ON...GOTO`/`ON...GOSUB` selectors, and
  `RANDOMIZE`'s seed all also gained compile-time "must be numeric" checks in the analyzer — not
  strictly required by DIALECT.md's "enforced at assignment time" wording (none of these are
  assignment sites), but cheap, valuable bonus coverage once `inferExpressionType` existed, and
  documented as such in `analyzer.ts`'s header comment rather than silently going beyond the
  step's literal scope.

- Step 16 (error-handling polish + compile-time undefined-line-target validation) — two
  independent additions sharing one theme: making every compile-time-vs-runtime failure boundary
  in DIALECT.md's runtime error taxonomy actually real.

  Undefined-line-target validation extended `semantics/analyzer.ts` (already carrying step 15's
  type-suffix checks) with a second, independent check: collect every `Line.lineNumber` in the
  program into a set, then validate every `GOTO`/`GOSUB`/`ON...GOTO`/`ON...GOSUB`/`IF`-line-branch/
  `RESTORE`-line target against it, pushing a new `UNDEFINED_LINE` diagnostic for anything that
  doesn't resolve. Reusing the same analyzer (and the same `SemanticError`-throwing `compile()`
  path from step 15) rather than a separate pass means a program with both a type mismatch and a
  bad jump target gets both diagnostics in one error, not a fix-one-see-the-next loop.

  Error-code taxonomy: `runtime/shared/errors.ts` gained `BasicErrorCode`/`BasicRuntimeError` —
  the latter is an **interface**, not a class with real `new` call sites, since the object that
  actually satisfies it is built entirely _inside emitted JS_ (a new prelude.ts helper,
  `__toBasicError(e, line)`, called from the dispatch loop's top-level catch in emit-program.ts)
  rather than by any TS code — emitted modules have zero import dependencies, so they can't
  `instanceof`-check against a real class the way normal TS would. `__toBasicError` classifies the
  caught error by matching its `message` against each code's own human-readable prefix text (every
  prelude helper's thrown message already happens to start with one, e.g. `"OVERFLOW: ..."`),
  falling back to a new `RUNTIME_ERROR` bucket for anything unrecognized (e.g. `RESTORE` to a line
  with no `DATA` of its own). `SYNTAX` and `UNDEFINED_LINE` were deliberately left out of
  `BasicErrorCode` — both are compile-time-only failures (`ParseError`/`SemanticError`) that stop
  compilation before the dispatch loop can ever run, so a runtime error object can never actually
  carry either code. `runtime/interface.ts`'s `reportError` was narrowed from a plain `Error`
  parameter to `BasicRuntimeError`, and both `NodeRuntime` and `TestRuntime` updated to match
  (`NodeRuntime`'s stderr output now includes the line number; `TestRuntime.errors` is now typed
  `BasicRuntimeError[]`).

  Also added in this step, since it's squarely "error-handling polish" and DIALECT.md's taxonomy
  already named a code with nothing that could ever raise it: `/`, `\`, and `MOD` now route through
  new `__div`/`__intDiv`/`__mod` prelude helpers that throw `DIVISION_BY_ZERO` on a zero divisor,
  instead of silently producing JS's own `Infinity`/`NaN`.

  **Real bug found and fixed** while wiring `NodeRuntime.reportError`'s new formatting: an early
  draft re-prefixed `error.code` onto an already-self-descriptive `error.message` (every prelude
  helper's message already starts with its own code text), which would have printed doubled text
  like `"OVERFLOW: OVERFLOW: 32768 does not fit..."`. Caught before it was ever committed, by
  actually reading the smoke-test output rather than assuming the formatting was right — fixed by
  dropping the redundant prefix.

- Step 17 (BrowserRuntime + the web/ React+Vite app) — `src/runtime/browser/browser-runtime.ts`'s
  `BrowserRuntime` follows the exact same shape as `NodeRuntime`/`TestRuntime` (implements
  `BasicRuntime`, delegates `random`/`seedRandom` to `SeedableRandom`) but reports every observable
  effect through three constructor-supplied callbacks (`onPrint`/`onInput`/`onError`) instead of
  touching stdio or the DOM directly — kept genuinely framework-agnostic (no React import) so a
  future non-React UI rewrite could reuse it verbatim, per the UI replaceability contract.
  `web/src/engine/useBrowserRuntime.ts` is the one file that bridges it to React state: a `run(js)`
  callback constructs a fresh `BrowserRuntime` per invocation (never shared across runs, matching
  `BasicRuntime`'s "no cross-invocation state" contract from the runtime host section above),
  wiring `onInput` to a `Promise` whose `resolve` is stashed in a ref until `submitInput` (called
  from the `InputPrompt` component when the user submits a value) fires it.

  `web/src/engine/compileProgram.ts` adapts `compile()`'s throw-on-error design (`LexError`/
  `ParseError`/`SemanticError`) into a `{ ok: true, js } | { ok: false, message }` discriminated
  union — the one place in the UI layer that needs a try/catch, so no component does.
  `importModuleFromSource` (`src/util/load-js-module.ts`, already written for the CLI/tests back in
  step 5) turned out fully portable to the browser as-is: dynamic `import()` of a `data:` URL needs
  no Node-specific API, so `useBrowserRuntime.ts` reuses it unmodified rather than needing a
  browser-specific loader.

  All 7 components got real implementations against their step-scaffolded prop shapes; `App.tsx`
  composes them into a 3-pane layout (source / output+input+error / generated JS) with zero
  compiler logic of its own, matching the UI replaceability contract. `web/src/examples/` (mirroring
  `tests/golden/programs/`, populated now rather than at its originally-speculated step 18, since
  `ExamplesMenu` needed real content to be useful) holds a byte-for-byte copy of each golden
  program's `.bas` source, imported via Vite's `?raw` suffix; a new `tests/web-examples-sync.test.ts`
  (in the root suite, not a web-workspace test — web/ has no vitest of its own) asserts the two
  never drift apart by reading both directly via `node:fs`, since Vite's `?raw` loader only resolves
  under Vite's own transform pipeline, not plain Node/Vitest.

  Verified end-to-end via a live browser session (not just `tsc`/build passing): loaded the
  bundled examples, ran `goto-basics` (GOTO/backward-jump output correct), ran `guess-number`
  (confirmed `mulberry32` with the same `RANDOMIZE 42` seed produces the identical target number
  61 in the browser as in Node/the CLI — real cross-environment determinism, not just a shared code
  path), exercised the `InputPrompt` round-trip, and triggered both a compile-time error (a real
  `ParseError`, surfaced via `ErrorPanel`) and a runtime error (division by zero, with the BASIC
  line number surfaced) to confirm `ErrorPanel` renders both paths correctly.

  **Real bug found and fixed, unrelated to any application code**: `web/package.json` had drifted
  to `vite@^6.0.5` while `vitest` (a root devDependency) pins `vite@^5.0.0` internally — since `@vitejs/plugin-react` supports both majors, npm's workspace hoisting correctly kept two separate
  `vite` installs (one hoisted to the root for `vitest`, one nested in `web/node_modules` for the
  web app's own devDependency), but that meant `web/vite.config.ts`'s `defineConfig`/`react()` call
  was type-checked against two structurally-incompatible `Plugin`/`PluginOption` types from two
  different `vite` package identities, breaking `web`'s `tsc --noEmit`. Not a bug in any code this
  step wrote — a pre-existing latent version-skew landmine in the original scaffold's `web/package.json`
  that simply hadn't been exercised until this step's `npx tsc --noEmit` in `web/` was the first
  time anything actually typechecked against `vite.config.ts`. Fixed by pinning `web/package.json`'s
  `vite` devDependency to `^5.4.11` (matching `vitest`'s own range) and regenerating the lockfile,
  so npm hoists a single shared `vite` instance for the whole workspace instead of two.

  `web/node_modules`'s pre-existing stale local install (present since initial scaffolding, before
  this step's `npm install` at the repo root) also had to be removed for the workspace hoisting to
  take effect — a real, if mundane, environment-setup finding worth recording since it wasn't
  obvious from `package.json` alone (the version skew was in `package-lock.json`'s resolved tree).

- Step 19 (CLI polish) — `--emit-ast`/`--emit-steps` (on `run`) deliberately bypass `compile()`
  entirely, calling `tokenize`/`parse`/`lower` directly instead: dumping the AST/`Step[]` is often
  exactly what you want _when_ a program has a compile-time `SemanticError`, to see why, so neither
  flag should be blocked by the same throw a normal run correctly is. This is a case where the CLI
  legitimately reaches past the `compile()` boundary into the compiler core's individual stages —
  allowed for the CLI specifically (unlike `web/src/engine`, which stays contractually restricted
  to `compile()` + `BrowserRuntime` only). `JSON.stringify`'s replacer flattens `LoweredProgram`'s
  `Map` fields (`lineToStep`/`dataLineStarts`/`fnDefs`) to plain objects, since a bare `Map`
  otherwise silently serializes as `"{}"`.

  Exit codes: found and fixed a real, pre-existing gap while implementing this — `basic2js run`
  always exited `0` even when a program hit a runtime `BasicRuntimeError` (OVERFLOW, DIVISION BY
  ZERO, ...), because the dispatch loop's top-level catch (`emit-program.ts`) reports the error and
  simply _stops_; it never makes the emitted `run(rt)` Promise itself reject, so `runCommand`'s
  `await run(rt)` always resolved normally regardless. Fixed by giving `NodeRuntime` a `hadError`
  flag (set by `reportError`) that `runCommand` checks afterward to set `process.exitCode = 1` —
  without re-printing the error, since `reportError` already wrote it to stderr.

  `--standalone` (on `convert`) appends a footer (`src/emitter/standalone-footer.ts`) that inlines
  a _complete_ minimal runtime as plain JS text — including a real mulberry32 PRNG, not
  `Math.random()`, so a standalone program's `RANDOMIZE`-seeded output matches `basic2js run`
  exactly — rather than importing `NodeRuntime`, which would silently reintroduce a dependency on
  the `basic2js` package being installed wherever the output file ends up, defeating the entire
  point of emitted code having zero import dependencies. Same "duplicate the pure logic as
  embedded text, don't import it" pattern `prelude.ts` already uses throughout.

  **Real bug found and fixed** (caught by an integration test that actually spawned the generated
  standalone output with a separate `node` invocation, not by reasoning about it in advance): the
  first version's "was this module run directly" check (`import.meta.url === "file://" +
process.argv[1]`, the naive textbook ESM idiom) silently did nothing — no output, no error, exit
  0 — whenever the invocation path crossed a symlink. This is the _common_ case on macOS (`/tmp` ->
  `/private/tmp`, `/var` -> `/private/var`, both of which `os.tmpdir()` routes through), since
  `import.meta.url` reflects Node's resolved (symlink-followed) module path while `process.argv[1]`
  is whatever un-resolved string the user typed — so any temp-directory-based test, and plenty of
  real invocations, hit the mismatch. Fixed by resolving both sides through
  `fs.realpathSync`/`url.pathToFileURL` before comparing. `tests/cli.test.ts`'s standalone tests
  (which spawn the CLI via `tsx` and the generated output via plain `node`, then diff output against
  an equivalent `basic2js run`) are what caught this — a case where an integration-level test caught
  a bug a unit test calling `convertCommand()` as a plain function never would have, since the bug
  was specifically about how a _separate_ `node` process resolves paths.

  New `tests/cli.test.ts` (the CLI's first test file — its logic had been thin enough not to need
  one before, but exit codes and `--standalone`'s cross-process behavior specifically aren't
  observable by calling `runCommand()`/`convertCommand()` as plain functions) spawns the actual CLI
  via `npx tsx src/cli/index.ts` rather than the built `dist/`, so the suite doesn't require
  `npm run build` to have run first.

- Step 20 (final docs pass) — a full read-through of every doc file (`README.md`, `CLAUDE.md`,
  `DIALECT.md`, `CONTRIBUTING.md`) against the actual, final state of the codebase. Found and fixed
  several small pieces of drift that had accumulated across steps 1–19, none large enough to
  warrant their own step but all worth closing out before calling the project done:
  - `README.md`'s status banner still said "early scaffolding... nothing runs end-to-end yet" —
    a leftover from the very first scaffolding commit, never updated as each step actually landed.
    Replaced with an accurate summary, plus a real Features section and the full CLI flag list.
  - `CLAUDE.md`'s own "Colocated unit tests, cross-cutting golden tests... See 'Testing' below"
    pointed at a "## Testing" section that never existed in this file — likely planned in the
    original scaffold and never written. Rewritten in place instead of adding a section that would
    have just duplicated CONTRIBUTING.md's existing testing conventions.
  - `CLAUDE.md`'s "How to add a new builtin function" recipe still pointed at
    `src/runtime/shared/{strings,math,formatting}.ts` as where new builtin logic goes — stale as of
    step 14's finding that pure/stateless builtins live in `prelude.ts` instead (see that step's
    notes above). Rewritten to point at the actual current recipe.
  - `src/ir/lower-expressions.ts` still carried a `TODO (build order step 13 for DEF FN...)` even
    though step 13 confirmed the file needs no real implementation at all (expression lowering
    turned out to always happen inline — see the step 13 notes). Rewritten as a closed-out finding,
    matching the convention already used for `strings.ts`/`math.ts`/`values.ts`/`symbol-table.ts`.
  - The "Staged build order" section's closing line ("every file not yet reached is a stub with a
    TODO...") was written when steps were still in progress and no longer described anything real
    once all 20 landed — replaced with a pointer at which files intentionally stayed stubs and why.
  - `CONTRIBUTING.md`'s "Debugging generated code" section had an "(once implemented per...)" hedge
    on `--emit-ast`/`--emit-steps` left over from before step 19 implemented them; also added the
    `--standalone` example and a note that both debug flags bypass semantic analysis on purpose.
  - `DIALECT.md`'s status line still said "as of build order step 16" even though steps 17–19 (none
    of which touched BASIC language semantics, only the web UI and CLI) had landed since — bumped
    to reflect the project being complete as of step 20, with no content changes needed beyond that
    (DIALECT.md's substance was already kept current at each step that actually changed semantics).

  No code changes in this step — verification was the existing full suite (`tsc --noEmit` in both
  workspaces, `vitest run`, `eslint .`, `npm run build` + `npm run web:build`) passing exactly as
  it did at the end of step 19, confirming the docs pass touched nothing behavioral.

All 20 build-order steps are now complete. `basic2js` compiles classic line-numbered BASIC to
JavaScript end-to-end — lexer through a browser-and-Node-both runtime — with a CLI, a web UI, and
a test suite (colocated unit + cross-cutting golden + CLI integration tests) covering every
statement, builtin, and documented edge case along the way.

- **GW-BASIC dialect extension (post-step-20 follow-on work)** — the first real multi-dialect
  feature: `compile(source, dialect)` now takes a `Dialect` (`src/dialect.ts`: `"classic"` |
  `"gwbasic"`), and `"gwbasic"` adds GW-BASIC's sequential file I/O (`OPEN`/`CLOSE`/`PRINT #`/
  `INPUT #`/`EOF()`) on top of everything `"classic"` already supports — see DIALECT.md's own
  "GW-BASIC dialect extension" section for the full syntax/semantics spec; this entry is the
  implementation-history/design-decisions record, matching every step above's convention.

  Key finding: **`dialect` only ever needs to reach the parser.** Every dialect-gated AST node
  (`OpenStmt`, `CloseStmt`, `PrintStmt`/`InputStmt`'s optional `fileNumber`, the `eof` builtin) can
  only exist at all if the parser already confirmed the right dialect was active when it was
  parsed — so semantic analysis, lowering, and emission stay entirely dialect-agnostic by
  construction, the same "resolve ambiguity at the earliest possible stage" pattern step 14's
  builtin-vs-ArrayRef disambiguation already established. Threading was correspondingly minimal:
  `TokenCursor` gained a `dialect` field, `parse()`/`compile()`/the CLI's `--dialect` flag/the web
  UI's dialect dropdown all just pass it down to that one place.

  Dialect gating happens in the **parser**, not the lexer: the lexer stays fully dialect-agnostic
  (`OPEN`/`CLOSE`/`AS`/`OUTPUT`/`APPEND` are always recognized keywords, `#` is always a tokenized
  operator — see lexer.ts/keywords.ts), and a new `requireGwBasic(cursor, token, feature)` parser
  helper throws a clear `"<feature> is a GW-BASIC dialect extension"` `ParseError` at each of the
  four gated call sites (`OPEN`, `CLOSE`, `PRINT #`, `INPUT #`) plus the `eof` builtin's
  registration (`src/parser/builtins.ts`'s `GWBASIC_ONLY_BUILTINS`). Chosen over lexer-level gating
  specifically so a classic-dialect program that happens to use these keywords gets one clear,
  actionable message instead of a confusing generic "unexpected token" error.

  Runtime host contract: `BasicRuntime` (`src/runtime/interface.ts`) gained 6 new **required**
  methods (not optional — every implementation must have them, even ones that never exercise
  file I/O, keeping the interface's own doc comment as the single source of truth for the contract
  rather than scattering "may be undefined" checks through emitted code) — 5 `async`
  (`openFile`/`closeFile`/`closeAllFiles`/`writeFile`/`readFileLine`) plus one deliberately
  **synchronous** `isFileEof`, since a host can always answer "was the last read the end" from
  state it already cached, letting `EOF()` be called directly from expression position with no
  `await` anywhere the compiler doesn't already support async evaluation. `NodeRuntime` backs this
  with real `node:fs` (using `createReadStream` + an eager readline async-iterator pre-fetch after
  every `OPEN...FOR INPUT`/`readFileLine`, so the _next_ line is always already known without
  further I/O by the time `isFileEof` is asked); `BrowserRuntime` and `TestRuntime` instead share a
  new `VirtualFileSystem` (`src/runtime/shared/virtual-fs.ts`) — composed in, not inherited, over
  an injectable `Map<string, string>` "disk" — since a browser tab has no real filesystem and a
  test shouldn't touch one. This mirrors the exact "genuinely shared vs. just similar" distinction
  step 14's `SeedableRandom` already established (`strings.ts`/`math.ts` stayed stubs because their
  logic was never genuinely shared; `VirtualFileSystem` _is_, so it gets a real shared class).

  **Real bug found via direct testing, not caught by reasoning in advance**: the first version of
  `runtime-calls.ts`'s `eof` entry emitted `rt.isFileEof(n)` directly — a raw JS boolean in
  expression position. Since `NOT`/`AND`/`OR` compile to JS's bitwise `~`/`&`/`|`, which only
  round-trip correctly against BASIC's own `-1`/`0` truthiness convention, `~true` evaluates to
  `-2` (still JS-truthy) rather than `-1` — so `WHILE NOT EOF(n)` never correctly terminated; it
  always attempted one `INPUT #` too many past the last line before throwing. Fixed by wrapping as
  `(rt.isFileEof(n) ? -1 : 0)`, matching the convention every comparison operator already uses.
  Caught by a throwaway smoke script exercising a real `WHILE NOT EOF...WEND` loop against a
  3-line virtual file — the same "verify by direct experimentation before/alongside formal tests"
  workflow used to find every other real bug across this project's build order.

  A second, smaller bug was caught the same way, this time in `VirtualFileSystem` itself: its
  methods are typed `Promise<...>` (matching `BasicRuntime`'s async contract) but the first version
  wasn't declared `async`, so a validation failure (`file #n is not open`, etc.) threw
  _synchronously_ rather than rejecting — harmless for emitted code's `await rt.foo(...)` (a
  synchronous throw during argument evaluation is still caught by the dispatch loop's surrounding
  try/catch exactly like a rejection would be), but a real footgun for any other caller expecting a
  genuine rejected Promise (`.catch(...)`, `Promise.all([...])`) — caught by `virtual-fs.test.ts`'s
  own unit tests failing in exactly that way. Fixed by declaring every failable method `async`.

  Web UI: a `DialectSelector` dropdown (`web/src/components/DialectSelector/`) sits in the toolbar
  next to `ExamplesMenu`; `App.tsx` owns `dialect` state and threads it through
  `compileProgram(source, dialect)`. `useBrowserRuntime.ts` now holds a persistent
  `Map<string, string>` (in a `useRef`, mutated in place by `BrowserRuntime`/`VirtualFileSystem`,
  then snapshotted into real React state right after each run completes so the UI re-renders) —
  giving the virtual "disk" real persistence across multiple runs within one session, matching how
  a real disk would behave. A new `VirtualFiles` panel (`web/src/components/VirtualFiles/`) shows
  the disk's contents (rendered only under the `gwbasic` dialect) with a "Clear" action. A new
  bundled example (`gwbasic-file-io`, mirrored into both `tests/golden/programs/` and
  `web/src/examples/`, matching every existing example) exercises `OPEN FOR OUTPUT` → `PRINT #` →
  `CLOSE` → `OPEN FOR APPEND` → `PRINT #` → `CLOSE` → `OPEN FOR INPUT` → a `WHILE NOT EOF` read
  loop → `CLOSE`; `web/src/examples/index.ts`'s `Example` type gained an optional `dialect` field
  so selecting it from `ExamplesMenu` also flips the toolbar's dropdown automatically, not just the
  loaded source text.

  Testing: `tests/golden/golden.test.ts` gained an optional per-fixture `dialect.txt` (just the
  literal `gwbasic`, since `"classic"` is already every other fixture's implicit default) rather
  than a bespoke mechanism, keeping golden fixtures the primary regression-coverage format for this
  feature the same way they are for every BASIC construct. Coverage spans every layer: parser
  (AST shapes for `OPEN`/`CLOSE`/`PRINT #`/`INPUT #`/`EOF()`, plus dialect-gating error messages
  under the default dialect), lowering (`OpenStep`/`CloseStep`, `fileNumber` threading into
  `PrintStep`/`InputStep`), semantic analysis (`OpenStmt`'s path must be a string/file number must
  be numeric, each `CloseStmt` file number must be numeric), emission (behavioral tests via
  `TestRuntime`, including the `WHILE NOT EOF` regression test for the truthiness bug above),
  runtime (`VirtualFileSystem` unit tests covering every OPEN mode/error path, `BrowserRuntime`
  delegation + cross-instance `Map` persistence tests), and the CLI (`--dialect gwbasic` against a
  real temp file on the real filesystem, `--dialect`'s gating error under the default dialect, and
  its own unrecognized-value error).
