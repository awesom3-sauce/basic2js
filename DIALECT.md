# BASIC Dialect Specification

This document is the source of truth for exactly what BASIC syntax and semantics `basic2js`
supports. It targets **classic line-numbered BASIC** (GW-BASIC/Applesoft/Dartmouth style), not a
structured dialect like QBasic. It is written as a spec-as-built: keep it in sync with the parser
and emitter as each feature lands (see CLAUDE.md's staged build order), and use it as the
reference when writing golden tests.

Status: complete as of build order step 20 — every construct documented below is implemented (see
CLAUDE.md's "Progress" notes for exactly which build-order step landed each one) — this file
describes the compiler as it actually behaves today, not a target spec for future work.

`compile(source, dialect)` (see `src/dialect.ts`) supports two dialects as of the GW-BASIC dialect
extension work: `"classic"` (the default — everything below except the "GW-BASIC dialect
extension" section) and `"gwbasic"` (`"classic"` **plus** that section's sequential file I/O). Both
the CLI (`--dialect gwbasic`) and the web UI (the toolbar's dialect dropdown) expose the choice —
see that section for exactly what changes. This is explicitly a first pass: only GW-BASIC's file
I/O was added on top of "classic" so far; further real dialects (Applesoft, Commodore BASIC, ...)
are a deliberately deferred follow-up, not a rejected idea — see CLAUDE.md's "Future: multiple
language pairs" for the analogous reasoning applied to whole additional _languages_ (not just
dialects of this one).

## General syntax rules

- **Line numbers** are required at the start of every line and determine execution order when
  sorted numerically (not textual/file order). Duplicate line numbers are a parse error.
- **Case-insensitivity**: all BASIC syntax — keywords and identifiers — is case-insensitive and
  normalized internally (`PRINT`, `Print`, `print` are identical; `A`, `a` are the same variable).
  **String literal contents are never touched by this normalization** — `"Hello"` and `"HELLO"`
  remain distinct string _values_. This split is a common source of bugs; keep it explicit in any
  code that touches identifiers vs. string data.
- **Type suffixes** (`%` integer, `!` single-precision, `#` double-precision, `$` string) are part
  of an identifier's spelling — `A`, `A%`, `A$` are three distinct variables. No suffix defaults to
  single precision. `DEFINT`/`DEFSNG`/`DEFDBL`/`DEFSTR` (per-letter default-type declarations) are
  **out of scope for v1** (see Open Decisions).
- **Colon (`:`) separates multiple statements on one line.** Each statement gets its own step in
  the compiled dispatch loop, so a mid-line `GOTO`/`GOSUB` can still resume correctly after a jump.
- **`REM`** and **`'`** start a comment that consumes the rest of the physical line.

## Statements (v1 scope)

- `PRINT` — with `;` (no separator/concatenate) and `,` (14-column tab-zone) segment separators;
  a trailing `;` or `,` suppresses the terminating newline. Numbers print with a leading space if
  non-negative and a trailing space always (classic BASIC convention).
- `INPUT ["prompt"(";"|",")] var[, var...]` — a prompt followed by `;` shows `prompt? ` (question
  mark appended); followed by `,` shows just `prompt` (no `?`); no prompt at all still shows a bare
  `? `. Suspends via the runtime's async `input()`, splits the response on commas, coerces each part
  to its target variable's suffix (numeric parse via `Number(...)`, falling back to `0` on
  unparseable input — a known simplification vs. real BASIC's "?Redo from start" re-prompt, see Open
  Decisions). The leading-semicolon `INPUT;` form (suppresses the newline after the user's typed
  response) isn't supported — out of scope, a formatting nuance rather than a functional gap.
- `LET var = expr` and implicit assignment (`var = expr` without `LET`).
- `IF cond THEN <line-number | statement-list> [ELSE <line-number | statement-list>]` — **the
  THEN/ELSE clause's statement list extends to the end of the physical line**, it is not
  terminated by the next colon the way top-level statements are. Falling off the end of a THEN/ELSE
  clause jumps to the start of the _next source line_, never to a sibling colon-statement on the
  `IF` line itself.
- `FOR var = start TO end [STEP step]` / `NEXT [var[, var...]]` — runtime stack semantics (not
  static lexical pairing), because `GOTO` may jump into/out of a loop body and a bare `NEXT` must
  match the innermost open `FOR`. `NEXT` without a matching `FOR` is a `NEXT WITHOUT FOR` runtime
  error. `start`/`end`/`step` are all evaluated once, using whatever value `var` held _before_ the
  `FOR` (so `FOR I = 1 TO I * 2` uses I's old value for the bound, not the just-assigned `1`), and
  only then is `var` assigned `start`. `NEXT var` (naming an outer loop while an inner one is still
  open) implicitly discards the unclosed inner frame(s) — matches real BASIC's "GOTO may abandon a
  loop with no matching NEXT" behavior. **`FOR` does not pre-test the condition**: `FOR I = 1 TO 0`
  still runs the body once — only `NEXT` ever checks whether to continue (a well-known classic-BASIC
  quirk, not a bug). A multi-variable `NEXT I, J` is treated as shorthand for separate consecutive
  `NEXT I` / `NEXT J` statements (see Open Decisions).
- `GOTO line-number`, `GOSUB line-number` / `RETURN` — `GOSUB` pushes a return address (the step
  right after the `GOSUB`) onto a runtime call stack; `RETURN` pops and jumps there. `RETURN` with
  an empty stack is a `RETURN WITHOUT GOSUB` runtime error.
- `ON expr GOTO line1, line2, ...` / `ON expr GOSUB line1, line2, ...` — `expr` is truncated to an
  integer `n` and jumps to (or, for `GOSUB`, calls) the `n`-th target, 1-indexed. See Open Decisions
  for out-of-range behavior (locked default: silent fallthrough, no error — and for `ON...GOSUB`
  specifically, no return address is pushed for a fallthrough either, so a subsequent stray
  `RETURN` still correctly raises `RETURN WITHOUT GOSUB` rather than jumping somewhere bogus).
- `WHILE cond` / `WEND` — **statically, lexically nested** (unlike `FOR`/`NEXT`), matched at
  compile time: a mismatched pair (a stray `WEND`, or a `WHILE` with no matching `WEND`) is a
  compile-time error, not a runtime one — it's a structural defect in the program, not something
  that depends on data. Unlike `FOR`, **`WHILE` _does_ pre-test the condition**: if it's false the
  very first time control reaches the `WHILE`, the body never runs at all (contrast `FOR I = 1 TO
0`, whose body runs once regardless — see the `FOR`/`NEXT` entry above).
- `DIM var(size[, size2]) [, var2(...)...]` — 1D and 2D arrays only in v1 (the parser doesn't
  enforce this; it's a runtime-representation choice, see Open Decisions). `DIM A(N)` allocates
  indices `0..N` (length `N+1`). An array used without an explicit `DIM` defaults to size 10 per
  dimension (indices `0..10`, classic BASIC behavior), allocated lazily on first access. Arrays and
  scalars occupy separate namespaces — `A` and `A(0)` coexist without conflict, since scalars live
  in `V` and arrays in `ARR`. Out-of-bounds (including negative) indices, and accessing an array
  with the wrong number of dimensions from how it was DIM'd/first-used, are both a
  `SUBSCRIPT OUT OF RANGE` runtime error. Re-`DIM`ing an already-allocated array silently resets it
  rather than raising GW-BASIC's `Redimensioned array` error (see Open Decisions).
  `identifier(args)` in an expression parses as an array reference unless `identifier` matches a
  known builtin function name (see "Builtin functions" below), in which case it's a call instead —
  a `DEF FN` call is syntactically distinct from both (always `FN name(args)`, see below) and
  unambiguous by construction, needing no name lookup at all.
- `DATA value, value, ...` — non-executable; all `DATA` statements in the program (including any
  nested inside an `IF`/`THEN`/`ELSE` branch) are collected, in source order, into one flat pool
  before execution begins. Each `value` must be a number (optionally negative) or a _quoted_ string
  literal — unquoted bare-word string data (`DATA JOHN, 25`, valid in real BASIC) isn't supported,
  see Open Decisions.
- `READ var[, var...]` — advances a shared pointer into the `DATA` pool. Unlike `INPUT`, `DATA`
  values are already typed from parsing; `READ` still applies the same runtime `%`/`$`-suffix
  coercion every other assignment site does (see Type-suffix semantics), but gets no _compile-time_
  mismatch check the way `LET` does — see that section for why. Reading past the end is an
  `OUT OF DATA` runtime error.
- `RESTORE [line-number]` — resets the `DATA` pointer to the start of the pool, or to the first
  `DATA` value originating from the given line (a runtime error if that line has no `DATA` of its
  own — see Open Decisions).
- `DEF FN name(param[, param...]) = expr` — single-line user function. Requires a space between
  `FN` and the function name (`DEF FN A(X) = ...`), not the concatenated `DEF FNA(X) = ...` form
  some classic BASIC listings also accept — see Open Decisions. Every `DEF FN` in the program is
  collected into a registry in a pre-pass before execution begins (like `DATA`, including any
  nested inside an `IF`/`THEN`/`ELSE` branch), so a function may be called before its textual
  `DEF FN` line runs, and `DEF FN` itself is non-executable (lowers to no `Step`). Emitted as a
  real JS function per definition, called inside `run()`'s closure: parameters become real JS
  function parameters (so JS's own scoping makes a parameter shadow a same-named global for the
  duration of the call, with no bespoke mechanism needed), while any free variable in the body
  reads live from the caller's current `V`/`ARR` state at call time — not a value snapshotted when
  `DEF FN` was declared.
- `END` / `STOP` — halt execution (`pc = -1`).
- `RANDOMIZE seed` — reseeds the runtime's PRNG (see the RND builtin below) so a subsequent `RND`
  sequence is deterministic. Unlike real GW-BASIC, `seed` is **required** in v1 — a bare
  `RANDOMIZE` with no argument (which interactively prompts "Random Number Seed" on real hardware)
  isn't supported, since this compiler targets non-interactive/scripted execution first. See Open
  Decisions.

## Operators

- Arithmetic: `+ - * /` (float division), `\` (integer division, truncating), `^` (exponent),
  `MOD` (modulo, truncating-division remainder — sign follows the dividend, which is exactly what
  JS's `%` already computes; emitted directly as JS `%`, verified against Microsoft BASIC's
  documented MOD behavior).
- String concatenation: `+` (context-determined by operand suffix, not a separate operator).
- Comparison: `= <> < > <= >=`.
- Logical: `AND OR NOT` — operate on BASIC's numeric-truthiness convention (0 = false, nonzero =
  true, results are numeric), not JS's `&&`/`||`/`!`.
- Precedence (highest to lowest): `^` › unary `-` › `* /` › `\` › `MOD` › `+ -` › comparisons ›
  `NOT` › `AND` › `OR`. Implemented and locked in `src/parser/precedence.ts` (build order step 6).
  Comparisons produce a number, not a JS boolean — classic BASIC represents `TRUE` as `-1` and
  `FALSE` as `0`. `AND`/`OR`/`NOT` are emitted as JS's bitwise `& | ~`, not logical `&& || !` — for
  the common case of both operands being 0/-1 (comparison results) this is exactly logical
  AND/OR/NOT; for arbitrary integers it's a true bitwise operation, matching real BASIC.

## Builtin functions (v1 scope, implemented build order step 14)

Every builtin name below is only reserved in **call position** — see Open Decisions — and always
takes parenthesized arguments, with arity enforced at **parse time** (a wrong argument count is a
compile-time `ParseError`, e.g. `LEFT$("X")` fails immediately, never a runtime surprise). See
`src/parser/builtins.ts` for the name/arity registry and `src/emitter/runtime-calls.ts` for the
name → emitted-JS mapping.

**String**: `LEFT$(s, n)`, `RIGHT$(s, n)` (both clamp `n` beyond the string's own length instead of
erroring), `MID$(s, start[, len])` (omitted `len` = to end of string), `LEN(s)`, `CHR$(code)`,
`ASC(s)` (error on empty string), `STR$(n)` (leading space for non-negative numbers, matching
PRINT's own convention, but **no** trailing space — that's PRINT-specific, not part of `STR$`'s
output), `VAL(s)` (parses a leading numeric prefix, ignoring surrounding whitespace; malformed
input → `0`), `INSTR([start,] haystack, needle)` (returns `0`, not `-1`, when not found — BASIC
convention, not JS's `indexOf`; `start` is 1-indexed like everything else in BASIC).

**Math**: `INT(n)` (floor — distinct from `%`-suffix coercion, which rounds; see Type-suffix
semantics), `ABS(n)`, `SQR(n)` (error on negative input), `RND(n)` (see Open Decisions for the
locked simplification around `n`), `SGN(n)`, `SIN`/`COS`/`TAN`.

**PRINT formatting** (recognized only inside `PRINT`'s segment list, not as general expressions —
see PRINT above and Open Decisions): `TAB(col)` (pads with spaces so the next segment starts at
column `col`, 1-indexed; contributes nothing if already at/past that column), `SPC(n)` (always
contributes exactly `n` literal spaces).

## Type-suffix semantics (implemented build order step 15)

Coercion/truncation is enforced **at assignment time** (`LET`, `FOR`-variable update, `READ`,
`INPUT`, array-element store), not on every intermediate expression — sub-expressions compute in
whatever precision naturally arises; only the destination truncates/rounds. A `FOR`-variable
update happens twice per loop: once when the `FOR` first assigns `start`, and again on every
`NEXT`'s increment (so a `%`-suffixed loop variable stays a valid integer across the whole loop,
not just its first iteration).

- `%` (integer): round-half-away-from-zero, then range-check `[-32768, 32767]`. Out-of-range
  throws an `OVERFLOW` runtime error (see Open Decisions — no silent wraparound). Implemented as
  `src/emitter/prelude.ts`'s `__toInt` — note this is round-**half-away-from-zero**, not JS's
  native `Math.round` (which rounds half toward `+Infinity`, giving the wrong answer for negative
  halves: `Math.round(-2.5)` is `-2`, not the `-3` BASIC's rule wants).
- `!` / `#` (single/double): both map to JS's native `number`; kept as distinct named coercions in
  code for clarity and future precision tuning, not because v1 enforces different precision. No
  runtime wrapping happens for these at all (or for no-suffix, which defaults to `!`) — a plain
  passthrough.
- `$` (string): identity coercion, but type-checks that the source is actually a string (raises a
  runtime `TYPE MISMATCH` if not — implemented as `__toStr`).
- String/number mismatches (e.g. `A$ = A$ + 5`) are caught by a **compile-time** semantic pass
  (`src/semantics/analyzer.ts`'s `analyze()`) wherever the suffix is syntactically known — which is
  nearly always, since the suffix is part of every identifier's spelling. Checked sites: `LET`'s
  target vs. value (including array-element targets), a `FOR` loop variable's suffix (rejects
  `$`) and its `start`/`end`/`STEP` expressions, an `IF`/`WHILE` condition, an `ON...GOTO`/
  `ON...GOSUB` selector, a `DIM`'s size expressions, and a `RANDOMIZE` seed — all must be numeric
  (except `LET`'s own target/value pair, which must simply _match_). **Not** checked at compile
  time: `READ`/`INPUT` targets — a `READ`'s source value comes from the `DATA` pool, whose
  contents at any given `READ` can depend on runtime `RESTORE`/control flow rather than just
  source order, so a general compile-time correlation isn't feasible; `INPUT`'s source is
  user-typed text, never statically known at all. Both still get the same _runtime_ coercion as
  everything else. Any diagnostic found makes `compile()` throw a `SemanticError` immediately
  (aggregating every diagnostic found, not just the first) rather than proceeding to emit code
  known to misbehave — see `src/semantics/semantic-error.ts`'s header comment for why a throwing
  design was chosen over a non-throwing `diagnostics` field.

## Runtime error taxonomy (implemented build order step 16)

Two kinds of failure, surfaced two different ways:

- **Compile-time-only**: `SYNTAX` (a `ParseError`, thrown directly by the parser — see
  `src/parser/errors.ts`) and `UNDEFINED_LINE` (a `SemanticError` diagnostic — see Type-suffix
  semantics' `SemanticError` note above, and the paragraph below). Neither can ever reach the
  dispatch loop at runtime: `SYNTAX` errors stop compilation before an AST even exists, and BASIC
  has no computed `GOTO` — every jump target (`GOTO`/`GOSUB`/`ON...GOTO`/`ON...GOSUB`/an `IF`'s
  line-number branch/a `RESTORE`'s line target) is fully known at compile time, so
  `src/semantics/analyzer.ts`'s `analyze()` checks every one of them against the set of line
  numbers the program actually defines, flagging any that don't resolve. `WHILE`/`WEND` mismatches
  (step 12) are the same category of structural defect and are likewise caught before runtime, just
  through a different mechanism (`lowering.ts`'s `resolveWhileWend`, not the analyzer).
- **Runtime**: `TYPE_MISMATCH` (also reachable here, not just at compile time — see `READ`'s entry
  above), `OVERFLOW`, `DIVISION_BY_ZERO` (raised by `/`, `\`, and `MOD` on a zero divisor — unlike
  JS's own operators, which silently produce `Infinity`/`NaN`), `SUBSCRIPT_OUT_OF_RANGE`,
  `OUT_OF_DATA`, `RETURN_WITHOUT_GOSUB`, `NEXT_WITHOUT_FOR`, `ILLEGAL_FUNCTION_CALL`, and a
  catch-all `RUNTIME_ERROR` fallback for anything that doesn't fit one of those (e.g. `RESTORE` to
  a line that exists but has no `DATA` of its own). Every runtime error is a `BasicRuntimeError`
  (`src/runtime/shared/errors.ts`: `message` + `code` + the BASIC line number executing when it was
  raised), constructed by `prelude.ts`'s `__toBasicError` — which matches the caught error's
  message against each code's own human-readable prefix text (every prelude helper's thrown
  message already starts with one, e.g. `"OVERFLOW: ..."`) — right before the dispatch loop's
  top-level catch hands it to `rt.reportError`.

## GW-BASIC dialect extension (file I/O)

Available only under `dialect: "gwbasic"` (see the intro above). Everything in this section is
gated at **parse time**: using one of these keywords/forms under the default `"classic"` dialect
raises a clear `ParseError` — `"<feature> is a GW-BASIC dialect extension — select the GW-BASIC
dialect to use it"` — rather than a confusing generic syntax error or, worse, a silent
misinterpretation. The lexer itself is dialect-agnostic (these keywords/the `#` operator are always
tokenized regardless of dialect); only the parser checks `dialect`, and nothing downstream
(semantic analysis, lowering, emission) needs to re-check it — see `src/dialect.ts`'s own doc
comment for why that's sufficient.

- **`OPEN path FOR mode AS #fileNumber`** — opens a sequential text file. `mode` is `INPUT`,
  `OUTPUT`, or `APPEND` (no `RANDOM`/`BINARY` file modes — out of scope, see Open Decisions below).
  `path` is any string expression; `fileNumber` is any numeric expression, with the `#` optional
  (`AS #1` and `AS 1` are both legal, matching real GW-BASIC). `OUTPUT` truncates the file
  immediately, even before any `PRINT #` write; `APPEND` preserves existing content and starts
  writing after it, creating the file if it doesn't exist yet. Re-`OPEN`ing an already-open file
  number, or `OPEN`ing a missing file `FOR INPUT`, raises a `FILE_ERROR` immediately (not deferred
  to the first read/write).
- **`CLOSE [#fileNumber[, #fileNumber...]]`** — closes the given file number(s); a bare `CLOSE`
  with no list closes every currently open file. Closing a file number that isn't open is a silent
  no-op (matches real GW-BASIC), not an error.
- **`PRINT #fileNumber, ...`** — identical segment syntax/formatting to console `PRINT` (`;`/`,`
  separators, `TAB()`/`SPC()`, the same number-formatting convention), just written to the file
  instead of `rt.print`. Writing to a file not open, or open for `INPUT`, raises `FILE_ERROR`.
- **`INPUT #fileNumber, var[, var...]`** — reads one line per target from the file (no comma-split
  across one line the way console `INPUT`'s single response is — each `INPUT #` target consumes its
  own line), coerced to the target's type suffix exactly like console `INPUT`. No prompt is ever
  printed. Reading from a file not open, open for `OUTPUT`/`APPEND`, or already at end-of-file
  raises `FILE_ERROR`. (Real GW-BASIC's `LINE INPUT #` — reads a whole line into one string target,
  no comma-splitting — is a distinct statement and isn't supported; out of scope for this pass.)
- **`EOF(fileNumber)`** — a builtin function, reserved **only under the `gwbasic` dialect** (see
  the general builtin-reservation rule in Open Decisions below, which otherwise applies dialect
  -wide) — returns BASIC's numeric-truthy `-1` once the file open for `INPUT` has no more lines to
  read, `0` otherwise. **Must** be wrapped as BASIC truthiness, not returned as a raw JS boolean,
  when read from the runtime — see the implementation note below. The standard idiom is
  `WHILE NOT EOF(n) ... INPUT #n, ... WEND`.
- **Runtime host contract**: `src/runtime/interface.ts`'s `BasicRuntime` requires 6 additional
  methods for every implementation (not just the ones that need file I/O — see that file's own doc
  comment for why they're required, not optional): `openFile`/`closeFile`/`closeAllFiles`/
  `writeFile`/`readFileLine` (all `async`) and `isFileEof` (deliberately **synchronous** — a host
  can always answer "was the last read the end" from state it already cached during the last
  read/open, so `EOF()` never needs the compiler to support async expression evaluation anywhere
  outside `INPUT` itself). `NodeRuntime` backs this with real `node:fs`; `BrowserRuntime` and
  `TestRuntime` share an in-memory `VirtualFileSystem` (`src/runtime/shared/virtual-fs.ts`) over an
  injectable `Map<string, string>` "disk" — a browser tab has no real filesystem, and a test
  shouldn't touch one. The web UI (`useBrowserRuntime.ts`) holds onto the same `Map` across
  multiple runs within one session, so the virtual "disk" persists like a real one would; its
  toolbar's "Virtual files" panel reads that `Map` directly to show what a program wrote.
- **Error taxonomy**: adds `FILE_ERROR` to the `BasicRuntimeError` codes listed in "Runtime error
  taxonomy" above, classified the same way every other code is — by its message's
  `"FILE ERROR: ..."` prefix, matched in `prelude.ts`'s `__toBasicError`. Every file-I/O failure
  (missing file, wrong mode, unopened/already-open file number, read past EOF) is a `FILE_ERROR`,
  never a bespoke code.
- **Implementation note — `EOF()`'s truthiness**: a real bug was found (and fixed) via direct
  testing during this feature's implementation, not caught by reasoning about it in advance: `NOT`/
  `AND`/`OR` compile to JS's bitwise `~`/`&`/`|`, which only round-trip correctly against BASIC's
  own `-1`/`0` truthiness convention — `~true` is `-2` in JS, not `-1`, so an unwrapped
  `rt.isFileEof(...)` (a genuine JS boolean) fed straight into `NOT EOF(n)` stayed truthy even once
  EOF _was_ reached, causing `WHILE NOT EOF(n)` to always attempt one extra `INPUT #` past the last
  line before ever exiting. Fixed in `src/emitter/runtime-calls.ts`'s `eof` entry by wrapping as
  `(rt.isFileEof(n) ? -1 : 0)`, matching every comparison operator's own convention. Any future
  runtime call feeding a JS boolean into expression position needs the same wrapping.

## Adding a dialect

The GW-BASIC dialect extension (above) and its later generalization into a data-driven
`DialectSpec` model (`src/dialect.ts`) leave a concrete recipe for a real third dialect (Applesoft,
Commodore BASIC V2, ...):

1. Write the new dialect's `DialectSpec` in `src/dialect.ts` — fill in whichever of
   `extraKeywords`/`droppedKeywords`/`unsupportedKeywords`/`extraBuiltins`/`identifierRule`/
   `disallowedSuffixes`/`builtinOverrides` it actually needs; leave the rest at their empty/`"full"`
   defaults, matching `CLASSIC_SPEC`/`GWBASIC_SPEC`.
2. Add the new dialect's literal to the `Dialect` union and register its spec in `DIALECT_SPECS`.
3. Add every genuinely new lexer keyword the spec introduces to `src/lexer/keywords.ts`'s
   `KEYWORDS` set — this applies to an `extraKeywords` entry that isn't a gated _form_ of an
   existing keyword (like `gwbasic`'s `"PRINT #"`), a `droppedKeywords` entry (the keyword must
   still lex as a real `Keyword` token for its own dialect for the rejection below to ever see it),
   and an `unsupportedKeywords` entry alike. The lexer always recognizes the union of every
   dialect's vocabulary; gating happens afterward, in the parser. **This step is easy to skip by
   mistake for `droppedKeywords`/`unsupportedKeywords` entries specifically** — it's obviously
   required for a new keyword no dialect has ever seen before, but just as required for a keyword
   another dialect already registers, since `KEYWORDS` is a single flat set, not per-dialect. Miss
   it and the keyword lexes as a plain `Identifier`, so neither availability check below ever runs
   and the rejection silently never fires.
4. For a **statement-position** construct (the keyword starts the statement — e.g. a dropped
   `WHILE`, or an unsupported `POKE` used as `POKE 1, 2`): `parseStatement`
   (`src/parser/parse-statements.ts`) already calls `checkBaselineKeywordAvailability` on every
   keyword-led statement before dispatching to its parse function, so a `droppedKeywords` or
   `unsupportedKeywords` entry is enforced automatically — no per-statement wiring needed for
   those two axes. An `extraKeywords` entry that's a genuinely new statement keyword still needs
   real AST/`Step`/emission support, per CLAUDE.md's "How to add a new BASIC statement" recipe,
   with its parse function calling `requireDialectKeyword` (`src/parser/parse-statements.ts`) at
   its entry point the way `OPEN`/`CLOSE`/`PRINT #`/`INPUT #` already do.
5. For an **expression-position** construct (the keyword appears inside an expression — e.g.
   `PEEK(n)` used as `X = PEEK(49152)`): step 4's `parseStatement` guard does **not** cover this —
   it only ever inspects a statement's leading token, and an expression-position keyword can appear
   anywhere inside one. Recognize it instead via the builtin-function registry
   (`src/parser/builtins.ts`'s `BUILTIN_FUNCTIONS` plus the spec's `extraBuiltins`, per CLAUDE.md's
   "How to add a new builtin function" recipe) if it has real JS semantics, or via a bespoke check
   in `parse-expressions.ts`'s `parsePrimary` if it doesn't fit the builtin-call shape. A
   hardware/platform-only construct with no JS equivalent at all (`PEEK`/`POKE`, graphics commands)
   should still list its statement-position form (if any) in `unsupportedKeywords` for the clear,
   automatic rejection step 4 describes — but its expression-position form (`PEEK(n)`) needs its
   own explicit rejection built at this step's `parsePrimary`/builtin-registration layer instead,
   since `unsupportedKeywords` is never consulted there. Building neither for an expression-position
   construct is exactly the "silent misinterpretation" outcome this project's "clear rejection over
   silent misinterpretation" posture forbids (Open Decisions, below) — a bare `PEEK` would otherwise
   quietly parse as an ordinary variable reference.
6. Add CLI (`--dialect <name>`, `src/cli/index.ts`'s `parseDialectOption`) and web UI
   (`web/src/components/DialectSelector`) support for the new literal.
7. Document every syntax/semantics delta in this file, in its own `## <Dialect> dialect extension`
   section (following the GW-BASIC section's structure above).
8. Add golden fixtures (`tests/golden/programs/`, mirrored into `web/src/examples/` — see
   CONTRIBUTING.md) exercising the new dialect's real behavior.

## Open Decisions / Locked Defaults

These behaviors vary across real historical BASIC interpreters and weren't pinned down by a single
reference dialect. Defaults below were chosen deliberately and are considered **locked unless
revisited explicitly** — if you change one, update this section and any golden tests it affects.

- **`ON GOTO`/`ON GOSUB` out-of-range selector**: silently falls through to the next statement, no
  error raised (matches GW-BASIC).
- **`%` overflow**: throws a runtime `OVERFLOW` error. Does **not** silently wrap around.
- **`RND`/`RANDOMIZE`**: backed by a seedable PRNG (mulberry32 — see
  `src/runtime/shared/random.ts`) for deterministic tests. **Not** bit-compatible with any real
  GW-BASIC RNG sequence — golden tests that use `RND` must call `RANDOMIZE <fixed-seed>` for
  determinism; do not attempt to match real-hardware output. `RANDOMIZE`'s seed argument is
  **required** in v1 (see Statements above). `RND(n)` always takes exactly one argument and always
  draws the next value from the seeded generator, **ignoring** the argument's actual value — real
  GW-BASIC's `n = 0` ("repeat the last value") and `n < 0` ("reseed from `n`") special cases aren't
  supported; use `RANDOMIZE` to seed instead. `TestRuntime` defaults to a fixed seed (unlike
  `NodeRuntime`'s wall-clock default) so an accidentally-unseeded test fails the same way every
  run instead of flaking — tests that exercise `RND` for real should still call `RANDOMIZE`
  explicitly, same as any golden test.
- **Builtin function names are reserved only in call position**: an identifier immediately
  followed by `(` that matches a builtin's name (e.g. `LEN(`) always resolves to that builtin, but
  a _bare_ identifier with the same spelling and no following `(` (e.g. `LET LEN = 5`) is still an
  ordinary variable — real BASIC reserves these names globally, in every position. This keeps the
  parser change scoped to the existing ArrayRef-vs-CallExpr decision point rather than requiring a
  symbol-table pass everywhere an identifier can appear. A `DIM`'d array sharing a builtin's name
  (e.g. `DIM LEN(10)`) is similarly not rejected at parse time; expression-position access with
  that name resolves to the builtin, not the array — avoid naming arrays after builtin functions.
  Revisit both if real-world ambiguity turns out to matter.
- **`EOF` is reserved in call position only under the `gwbasic` dialect** — the exact same
  call-position-only rule as every other builtin (above), plus one extra axis: under `"classic"`,
  `EOF(1)` parses as an ordinary `ArrayRef` (ArrayRef-vs-CallExpr disambiguation happens
  per-dialect, via `src/parser/builtins.ts`'s `GWBASIC_ONLY_BUILTINS`), so a classic-dialect program
  that happens to use `EOF` as an array name keeps working unchanged.
- **No `RANDOM`/`BINARY` file modes, no `LINE INPUT #`**: the GW-BASIC dialect extension covers only
  sequential `INPUT`/`OUTPUT`/`APPEND` text-file access (see that section above) — real GW-BASIC's
  random-access records and `LINE INPUT #` (whole-line-no-comma-split reads) are out of scope for
  this first pass. Revisit if a real-world `.bas` listing needs them.
- **`TAB`/`SPC` are recognized only inside PRINT's segment list**, not as general expressions —
  matches real classic BASIC's own restriction. A bare `TAB`/`SPC` with no following `(`, or either
  name used anywhere outside PRINT, is treated as an ordinary variable (unlike the general builtin
  registry's reservation, `TAB`/`SPC` aren't in that registry at all — see parsePrintStmt).
- **`DEFINT`/`DEFSNG`/`DEFDBL`/`DEFSTR`**: out of scope for v1 entirely (not parsed, not
  supported). Revisit if a real-world `.bas` listing needs them.
- **Array dimensions**: 1D and 2D only in v1. 3D+ is out of scope until a concrete need appears.
- **`IF`/`THEN`/`ELSE` clause-extends-to-end-of-line**: locked in, see Statements above — this is
  the classic-BASIC-accurate behavior, not a simplification.
- **`INT()` vs. `%`-suffix coercion**: deliberately different (floor vs. round) — matches real
  GW-BASIC's differing behavior between the builtin function and suffix-driven assignment
  coercion; do not "fix" this into consistency.
- **`,` tab-zone padding in PRINT**: computed from a column counter that resets to 0 at the start
  of every PRINT statement (see `src/emitter/emit-print.ts`), not tracked across statements or
  lines. A previous PRINT ending in `;`/`,` (suppressing its newline) leaves the real terminal
  cursor at a nonzero column this doesn't account for. Revisit if real cross-statement column
  tracking turns out to matter for a golden program.
- **`DEF FN`/`FN` require a space between `FN` and the function name**: `DEF FN A(X) = ...` is
  supported; the concatenated `DEF FNA(X) = ...` form some classic BASIC listings allow is not.
  Without the space, `FNA` lexes as a single Identifier token indistinguishable from a bare
  variable, which would need lexer state or a symbol-table-aware two-pass parse to resolve;
  requiring the space sidesteps that and, as a bonus, makes `FN name(...)` calls unambiguous with
  array references at parse time too (a call is always `FN`-keyword-prefixed, an array reference
  never is). Revisit only if a real-world `.bas` listing needs the concatenated form.
- **Integer division `\`**: emitted as `__intDiv(left, right)` (`Math.trunc(left / right)`, plus a
  `DIVISION_BY_ZERO` guard — see prelude.ts). Real GW-BASIC may round each operand to an integer
  _before_ dividing rather than just truncating the final quotient — unverified; revisit if it
  matters for a golden program.
- **Multi-variable `NEXT I, J`**: treated as shorthand for separate consecutive `NEXT I` / `NEXT J`
  statements (each lowers to its own independent Step, evaluated in the order written). Real BASIC
  dialects vary on the exact semantics here and it's a rare construct in practice; revisit only if
  a real-world program needs different behavior.
- **`INPUT` numeric parsing on invalid input**: falls back to `0` for unparseable numeric input,
  rather than real BASIC's `?Redo from start` re-prompt loop. This is a deliberate, permanent v1
  scoping decision, not a "deferred" TODO: step 15's type-suffix work added `%`-suffix
  round+overflow checking on top of the parsed number, but left this specific simplification
  alone. A real re-prompt loop would need the runtime's `input()` call site to loop, which is a
  bigger structural change than type-suffix enforcement's scope — revisit only if a real-world
  `.bas` listing actually depends on the retry behavior.
- **Leading `INPUT;` form**: not supported (out of scope) — this is the syntax for suppressing the
  newline echoed after the user's response, a formatting nuance distinct from the prompt's own
  `;`/`,` separator, which _is_ fully supported.
- **Array runtime representation**: every array (1D or 2D) is one flat JS array (`{ dims, data }`)
  with a manually computed linear index, not nested arrays — keeps 1D/2D (and, though undocumented
  as supported, N-D) index computation uniform. An implementation detail, not user-visible.
- **Re-`DIM`ing an array**: silently reallocates (resets) it rather than raising GW-BASIC's
  `Redimensioned array` error. Revisited at step 16 (error-taxonomy polish) and deliberately kept
  as-is — no golden program or real-world `.bas` listing has needed the stricter behavior yet.
- **Unquoted DATA values**: not supported — only numbers and quoted strings. Real BASIC allows
  bare-word string data (`DATA JOHN, 25`), but the lexer already normalizes identifier-shaped
  tokens to lowercase at tokenize time (it has no way to know, that early, that a token is a DATA
  value rather than an identifier that legitimately should be case-normalized), which would
  silently corrupt an unquoted value's case. Requiring quotes sidesteps this entirely.
- **`RESTORE <line>` targeting a line with no `DATA` of its own**: a runtime error ("RESTORE: no
  DATA at line N"), rather than falling back to the nearest following `DATA`-bearing line. Simpler,
  and `RESTORE` almost always targets a line that actually has `DATA` in practice. Classified as
  the generic `RUNTIME_ERROR` fallback code (see Runtime error taxonomy) rather than a dedicated
  one of its own — a single, rare edge case didn't seem worth its own taxonomy entry.
- **`/`/`\`/`MOD` by zero**: raises a runtime `DIVISION_BY_ZERO` error (build order step 16),
  unlike JS's own operators, which silently produce `Infinity`/`-Infinity`/`NaN`. Matches real
  BASIC's behavior; a deliberate correction, not a simplification.
- **Runtime error classification is message-prefix matching, not typed exceptions**: emitted code
  has zero import dependencies (see CLAUDE.md's runtime host contract), so `prelude.ts`'s
  `__toBasicError` can't `instanceof`-check against a real `BasicRuntimeError` class the way normal
  TS code would — it matches the caught error's `message` against each `BasicErrorCode`'s own
  human-readable prefix text instead (e.g. a message starting with `"OVERFLOW"` becomes the
  `OVERFLOW` code), falling back to `RUNTIME_ERROR` for anything that doesn't match. This means
  **every new prelude helper that throws a domain-specific error must start its message with a
  recognized prefix**, or it silently becomes an untyped `RUNTIME_ERROR` — `runtime-calls.test.ts`-
  style key-set assertions don't (and can't easily) catch this class of mistake, so double-check it
  by hand when adding a new throwing helper to `prelude.ts`.
