# Bundled examples

Sample `.bas` programs shown in the `ExamplesMenu` component, mirroring
`tests/golden/programs/` — each file here is a byte-for-byte copy of its
golden-test counterpart, so the web UI and the test suite never drift
apart. `tests/web-examples-sync.test.ts` (run as part of the normal root
`npm test`, not a web-workspace test — see its own header comment) asserts
this directly: it fails if a `.bas` file here doesn't exactly match
`tests/golden/programs/<name>/program.bas`, or if the two directories'
program sets don't match 1:1.

`index.ts` imports each file via Vite's `?raw` suffix and exports the
`EXAMPLES` registry `ExamplesMenu` renders. To add a new bundled example:
add the golden program first (see the root `CLAUDE.md`'s testing
conventions), then copy its `program.bas` here under the same base name,
then add an entry to `index.ts`.
