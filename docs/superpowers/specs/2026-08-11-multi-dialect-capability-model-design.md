# Multi-dialect capability model — design

**Status:** approved, not yet implemented
**Author:** brainstormed with the user, 2026-08-11
**Depends on:** the GW-BASIC dialect extension (`src/dialect.ts`, `requireGwBasic` — see
[DIALECT.md](../../../DIALECT.md)'s "GW-BASIC dialect extension" section and
[CLAUDE.md](../../../CLAUDE.md)'s Progress notes for that feature)

## Context

`basic2js` currently supports two dialects: `"classic"` and `"gwbasic"` (`"classic"` plus
sequential file I/O). The mechanism behind `"gwbasic"` is purely additive: new keywords, gated at
parse time by a single `requireGwBasic(cursor, token, feature)` check, with the explicit design
premise (documented in `src/dialect.ts`'s header comment) that "dialect only ever needs to reach
the parser" — semantic analysis, lowering, and emission never look at `dialect` at all.

The user asked how to start adding further real dialects — specifically **Applesoft BASIC** (Apple
II) and **Commodore BASIC V2** (C64). Looking at what those two actually need revealed that the
current purely-additive, parser-only model can't express everything a real dialect diverges on:

- **Removing syntax**, not just adding it — Commodore BASIC V2 has no `WHILE`/`WEND` at all.
- **Changing an existing construct's behavior**, not just its availability — both target dialects
  truncate variable names to their first 2 significant characters (`SCORE` and `SCALE` collide);
  both give `RND(n)` real per-argument semantics (reseed / repeat-last-value), unlike `gwbasic`'s
  locked "ignore `n`" simplification.
- **Recognizing syntax with no meaningful JS translation at all** — `PEEK`/`POKE`/`CALL`/`SYS` and
  graphics commands (`HGR`/`HPLOT`/`GR`/`PLOT`) are real BASIC keywords, but there's no faithful
  JavaScript equivalent for direct memory access or an Apple II/C64 screen.

This spec designs a generalized capability model that can express all of the above. It does
**not** implement Applesoft or Commodore BASIC — see Scope below.

## Goals

- Replace the single `requireGwBasic`-style ad hoc gating with a data-driven `DialectSpec` per
  dialect, so "what does dialect X do differently" is answerable by reading one object.
- Support all five divergence axes identified above: add keywords, remove keywords, reject
  no-equivalent keywords, change identifier normalization, override a builtin's JS emission.
- Do this with **zero observable behavior change** to `classic`/`gwbasic` — the existing 423-test
  suite is the correctness bar, not a new one.
- Leave a documented, followable recipe for adding a real third dialect later.

## Non-goals (explicitly out of scope for this spec)

- **Implementing Applesoft BASIC or Commodore BASIC V2.** Both are real follow-on work, each with
  its own future spec, once this mechanism exists. This spec's only "proof" is refactoring
  `classic`/`gwbasic` onto the new model losslessly.
- **Adding a third `Dialect` literal value.** `Dialect` stays `"classic" | "gwbasic"`. A
  test-only synthetic `DialectSpec` (not part of the real `Dialect` union) exercises the new axes
  that `classic`/`gwbasic` don't need (dropped keywords, unsupported keywords, identifier
  truncation, builtin overrides).
- **Hardware/platform emulation.** `PEEK`/`POKE`/graphics commands are rejected with a clear
  compile error, never stubbed as no-ops. A stubbed `PEEK` returning `0` would let a program
  compile and run to completion while silently not being a faithful 1:1 clone — worse than a clean
  rejection, per this project's existing "clear rejection over confusing rejection or silent
  misinterpretation" posture (see DIALECT.md, and the honesty given to the user when asked whether
  basic2js converts "ANY" BASIC code).

## Architecture

### Where `dialect` threads

| Stage | Today | After this change |
|---|---|---|
| Lexer | dialect-agnostic | **dialect-aware** — identifier normalization (case-fold + optional significant-char truncation) |
| Parser | dialect-aware (`requireGwBasic`) | dialect-aware — generalized keyword-legality check against `DialectSpec` |
| Semantic analysis | dialect-agnostic | unchanged |
| Lowering | dialect-agnostic | unchanged |
| Emitter | dialect-agnostic | **dialect-aware** — builtin JS-emission can be overridden per dialect |
| Runtime | dialect-agnostic (host interface) | unchanged |

This widens the "dialect only reaches the parser" premise to three stages — lexer, parser,
emitter — each for one narrow, specific reason tied to a real divergence axis found above. Nothing
else changes: the lexer still recognizes the union of all dialects' keywords unconditionally
(unchanged from today), and semantic analysis/lowering never consult `dialect` (unchanged).

### `DialectSpec`

One `DialectSpec` object per dialect (including `classic` and `gwbasic` themselves — `classic`'s
is the near-empty implicit baseline, `gwbasic`'s expresses exactly what `requireGwBasic`'s four
call sites express today). Fields, at the level of precision useful for a design (exact TypeScript
shape is an implementation detail for the plan):

- **`extraKeywords`** — keywords this dialect adds beyond the shared baseline. Generalizes
  `gwbasic`'s `OPEN`/`CLOSE`/`AS`/`OUTPUT`/`APPEND`. A baseline keyword used under a dialect that
  doesn't list it as available raises the existing "wrong dialect" error shape.
- **`droppedKeywords`** — baseline keywords this dialect deliberately lacks (Commodore BASIC V2's
  missing `WHILE`/`WEND`). Raises the new "dropped from this dialect" error shape.
- **`unsupportedKeywords`** — real BASIC keywords with no JS equivalent at all (`PEEK`/`POKE`/
  `CALL`/`SYS`/graphics commands), each carrying its own reason string. Raises the new "no JS
  equivalent" error shape. Distinct from `droppedKeywords` because the message must not suggest
  switching dialects would help.
- **`identifierRule`** — `"full"` (classic/gwbasic, today's unchanged behavior: full-name,
  case-folded) or a truncation rule expressing "only the first N characters are significant"
  (Applesoft/Commodore's 2-char truncation — a future dialect's concern, not implemented here).
- **`disallowedSuffixes`** — type suffixes this dialect doesn't have (Commodore BASIC V2 has no
  `!`/`#` precision suffixes — real BASIC's are 5-byte floats only). Empty for `classic`/`gwbasic`.
- **`builtinOverrides`** — same builtin name/arity, different JS emission (Commodore's real
  `RND(n)` semantics vs. `gwbasic`'s locked "ignore `n`" simplification). Empty for
  `classic`/`gwbasic` — proves the override mechanism is inert unless a dialect actually defines
  one.

### Error handling — three message shapes

1. **Wrong dialect** (existing pattern, generalized from `requireGwBasic`) — a keyword exists,
   just not under the active dialect: `"OPEN is a GW-BASIC dialect extension — select the GW-BASIC
   dialect to use it"`. Applies to `extraKeywords`.
2. **Dropped from this dialect** (new) — a keyword `classic`/`gwbasic` support, but this dialect
   deliberately removed: `"WHILE/WEND is not available in Commodore BASIC V2 — this dialect only
   supports GOTO-based loops"`. No dialect-switch suggestion — the fix is rewriting the program.
3. **No JS equivalent** (new) — recognized BASIC syntax, no possible translation, in any dialect:
   `"PEEK is not supported by basic2js: no meaningful JavaScript equivalent for direct memory
   access"`. No dialect-switch suggestion either.

All three remain `ParseError`s raised at the same point `requireGwBasic` raises today (parse time,
once the keyword is recognized, when the gating check against the active `DialectSpec` fails).

## Migration and validation plan

No new `Dialect` literal is added. The validation is refactoring `classic` and `gwbasic` onto
`DialectSpec` losslessly:

- `classic`'s spec: `extraKeywords: []`, `droppedKeywords: []`, `unsupportedKeywords: []`,
  `identifierRule: "full"`, `disallowedSuffixes: []`, `builtinOverrides: {}` — data-encodes
  today's baseline, changing nothing observable.
- `gwbasic`'s spec: `extraKeywords: ["OPEN", "CLOSE", "AS", "OUTPUT", "APPEND"]` plus the `eof`
  builtin addition — exactly what `requireGwBasic`'s four call sites express today, now read from
  one object instead of four scattered checks.

This is deliberately the only thing that changes behaviorally in this pass: **nothing**. The full
existing test suite (423 tests as of the GW-BASIC dialect extension) passing unchanged is the
correctness bar — if `classic`/`gwbasic` don't refactor onto the new model losslessly, the model
isn't right yet, before any real third dialect ever touches it.

## Testing

- **Regression**: the full existing suite (colocated unit + golden + CLI integration) must pass
  unchanged after the refactor — no new fixtures needed for `classic`/`gwbasic` since nothing
  about them changes.
- **New mechanism coverage**: since no real dialect yet exercises `droppedKeywords`/
  `unsupportedKeywords`/`identifierRule`/`builtinOverrides`, a small test-only synthetic
  `DialectSpec` (constructed directly in a test file, not registered in the real `Dialect` union)
  exercises each new axis in isolation — proving the mechanism itself before Applesoft/Commodore
  exist to prove it for real. Covers: a dropped-keyword rejection, an unsupported-keyword
  rejection (with the distinct message shape), identifier truncation colliding two variables, and
  a builtin-override changing emitted JS for a call.

## Docs

- DIALECT.md gains an "Adding a dialect" recipe, mirroring CLAUDE.md's existing "How to add a new
  BASIC statement" recipe: write the `DialectSpec`, add the `Dialect` literal, wire CLI/web
  dropdown labels, document syntax deltas in DIALECT.md, add golden fixtures.
- CLAUDE.md's `src/dialect.ts` header comment and Progress notes get corrected to describe the
  real (now three-stage: lexer/parser/emitter) threading, replacing the "dialect only reaches the
  parser" claim the GW-BASIC dialect extension established.

## Open questions for the implementation plan

These are deliberately left for `writing-plans`, not resolved here:

- Exact TypeScript shape of `DialectSpec` and where it lives (`src/dialect.ts` growing in place vs.
  splitting into `src/dialect/{types,specs,index}.ts`, matching the project's "many small files"
  convention once the object has real substance).
- Exact signature change to `tokenize()`/`emit()` (both currently dialect-unaware) — likely
  `tokenize(source, dialectSpec)` and `emit(lowered, dialectSpec)`, mirroring how `parse()` already
  takes `dialect` today.
- Whether `RUNTIME_CALLS` (emitter/runtime-calls.ts) gains a dialect-keyed override layer checked
  before the shared table, or a different resolution shape — implementation detail once the
  builtin-override axis is being wired up for real.
