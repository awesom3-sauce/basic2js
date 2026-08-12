# basic2js

A sophisticated, functionally **1:1** converter from classic line-numbered BASIC
(GW-BASIC/Applesoft/Dartmouth style) to JavaScript — including full support for unstructured
`GOTO`/`GOSUB` control flow, via an async "virtual program counter" dispatch loop. See
[DIALECT.md](DIALECT.md) for the exact supported syntax and [CLAUDE.md](CLAUDE.md) for the
architecture and build order.

> **Status**: the full compiler pipeline (lexer → parser → semantic analyzer → lowering → emitter)
> and both runtimes (Node CLI, browser) are implemented and working end-to-end, per
> [CLAUDE.md](CLAUDE.md#staged-build-order)'s staged build order (currently through step 17 of 20).
> Remaining steps are CLI polish and a final docs pass — see CLAUDE.md's "Progress" notes for
> exactly what's landed so far.

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

## What it does (target behavior)

```bash
basic2js run program.bas              # compile + execute in one step, in-process
basic2js convert program.bas -o out.js  # write the generated JS to a file
basic2js convert program.bas --standalone -o out.js   # ...and make it runnable via `node out.js`
```

The generated JavaScript is driven by an injected `BasicRuntime` interface (`print`/`input`/etc.),
so the exact same compiled output runs unmodified under the Node CLI or the browser-based web UI.

## Web UI

A local/deployed web UI ([web/](web/), React + Vite + TypeScript) lets you paste BASIC source,
see the generated JS, and run it interactively in the browser.

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
