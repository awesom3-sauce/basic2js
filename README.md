# basic2js

[![CI](https://github.com/awesom3-sauce/basic2js/actions/workflows/ci.yml/badge.svg)](https://github.com/awesom3-sauce/basic2js/actions/workflows/ci.yml)

A sophisticated, functionally **1:1** converter from classic line-numbered BASIC
(GW-BASIC/Applesoft/Dartmouth style) to JavaScript — including full support for unstructured
`GOTO`/`GOSUB` control flow, via an async "virtual program counter" dispatch loop. See
[DIALECT.md](DIALECT.md) for the exact supported syntax and [CLAUDE.md](CLAUDE.md) for the
architecture and build order.

> **Status**: complete — the full compiler pipeline (lexer → parser → semantic analyzer →
> lowering → emitter), all three runtimes (Node CLI, browser, in-memory test harness), and the
> web UI are implemented and working end-to-end, per [CLAUDE.md](CLAUDE.md#staged-build-order)'s
> 20-step staged build order. See CLAUDE.md's "Progress" notes for the full build history and the
> design decisions/real bugs found along the way at each step.

## Features

- **PRINT/INPUT/LET**, `IF`/`THEN`/`ELSE`, `FOR`/`NEXT`/`STEP`, `GOTO`/`GOSUB`/`RETURN`,
  `ON...GOTO`/`ON...GOSUB`, `WHILE`/`WEND`, `DIM` (1D/2D arrays), `DATA`/`READ`/`RESTORE`,
  `DEF FN`, `RANDOMIZE`, colon-separated multi-statement lines, `REM`/`'` comments, `END`/`STOP`.
- Full operator precedence (`^ - * / \ MOD + - comparisons NOT AND OR`) and the standard
  string/math builtin library (`LEFT$`/`RIGHT$`/`MID$`/`LEN`/`CHR$`/`ASC`/`STR$`/`VAL`/`INSTR`,
  `INT`/`ABS`/`SQR`/`RND`/`SGN`/`SIN`/`COS`/`TAN`, `TAB()`/`SPC()`).
  `%`/`!`/`#`/`$` type-suffix enforcement, both at compile time (a semantic analyzer catches
  string/number mismatches and undefined `GOTO`/`GOSUB` line targets before anything runs) and at
  runtime (`%` overflow, `$` type-checking).
- See [DIALECT.md](DIALECT.md) for the exact semantics of every construct above, plus the full
  list of deliberate scoping decisions ("Open Decisions / Locked Defaults").

## Quickstart

```bash
npm install
npm run build
node dist/cli/index.js run tests/golden/programs/fizzbuzz/program.bas
```

During development, skip the build step with `tsx`:

```bash
npx tsx src/cli/index.ts run path/to/program.bas
```

## CLI

```bash
basic2js run program.bas                                # compile + execute in one step, in-process
basic2js run program.bas < input.txt                     # non-interactive, scripted INPUT
basic2js run program.bas --emit-ast                      # debug: dump the parsed AST as JSON
basic2js run program.bas --emit-steps                    # debug: dump the lowered Step[] IR as JSON
basic2js convert program.bas -o out.js                   # write the generated JS to a file
basic2js convert program.bas --standalone -o out.js      # ...and make out.js runnable via plain `node out.js`,
                                                          #    no basic2js install needed wherever it ends up
```

(`basic2js` above assumes the package is installed/linked so its bin is on your `PATH`; in this
repo, substitute `node dist/cli/index.js` — see Quickstart.)

The generated JavaScript is driven by an injected `BasicRuntime` interface (`print`/`input`/etc.),
so the exact same compiled output runs unmodified under the Node CLI or the browser-based web UI.

## Web UI

A local/deployed web UI ([web/](web/), React + Vite + TypeScript) lets you paste BASIC source,
see the generated JS, and run it interactively in the browser — including live `INPUT` prompts and
a library of bundled example programs.

```bash
npm run web:dev      # local dev server
npm run web:build      # production build -> web/dist
```

**Deployment**: hosted as a static site on [Vercel](https://vercel.com) — see
[vercel.json](vercel.json). Connect this repository in the Vercel dashboard (or run `vercel deploy`
from the repo root with the Vercel CLI); it auto-detects the Vite build via `vercel.json`'s
`buildCommand`/`outputDirectory`. No server/API routes are needed since the whole app runs
client-side.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the dev workflow, and [CLAUDE.md](CLAUDE.md) for the
pipeline architecture, conventions, and how to add new BASIC statements/functions.

```bash
npm run typecheck
npm test
npm run lint
```

## License

[GPL-3.0](LICENSE)
