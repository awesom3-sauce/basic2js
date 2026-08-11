# BASIC Dialect Specification

This document is the source of truth for exactly what BASIC syntax and semantics `basic2js`
supports. It targets **classic line-numbered BASIC** (GW-BASIC/Applesoft/Dartmouth style), not a
structured dialect like QBasic. It is written as a spec-as-built: keep it in sync with the parser
and emitter as each feature lands (see CLAUDE.md's staged build order), and use it as the
reference when writing golden tests.

Status legend: each section should eventually be marked `[ ]` planned / `[x]` implemented as the
build order progresses. Currently everything is `[ ]` — this is the target spec, not yet built.

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
  compile time.
- `DIM var(size[, size2]) [, var2(...)...]` — 1D and 2D arrays only in v1 (the parser doesn't
  enforce this; it's a runtime-representation choice, see Open Decisions). `DIM A(N)` allocates
  indices `0..N` (length `N+1`). An array used without an explicit `DIM` defaults to size 10 per
  dimension (indices `0..10`, classic BASIC behavior), allocated lazily on first access. Arrays and
  scalars occupy separate namespaces — `A` and `A(0)` coexist without conflict, since scalars live
  in `V` and arrays in `ARR`. Out-of-bounds (including negative) indices, and accessing an array
  with the wrong number of dimensions from how it was DIM'd/first-used, are both a
  `SUBSCRIPT OUT OF RANGE` runtime error. Re-`DIM`ing an already-allocated array silently resets it
  rather than raising GW-BASIC's `Redimensioned array` error (see Open Decisions).
  `identifier(args)` in an expression is always parsed as an array reference (never a builtin/DEF FN
  call) — correct for now since neither exists yet; steps 13/14 will need to add real
  disambiguation.
- `DATA value, value, ...` — non-executable; all `DATA` statements in the program are collected
  (in line order) into one flat pool before execution begins.
- `READ var[, var...]` — advances a shared pointer into the `DATA` pool, coercing each value to
  its target's suffix. Reading past the end is an `OUT OF DATA` runtime error.
- `RESTORE [line-number]` — resets the `DATA` pointer to the start of the pool, or to the first
  `DATA` value originating from the given line.
- `DEF FN name(param[, param...]) = expr` — single-line user function. Parameters shadow locally;
  any free variable referenced in the body reads live from the caller's variable state (confirm
  and document exact scoping when implementing step 13).
- `END` / `STOP` — halt execution (`pc = -1`).

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

## Builtin functions (v1 scope)

**String**: `LEFT$(s, n)`, `RIGHT$(s, n)`, `MID$(s, start[, len])` (omitted `len` = to end of
string), `LEN(s)`, `CHR$(code)`, `ASC(s)` (error on empty string), `STR$(n)`, `VAL(s)` (parses a
leading numeric prefix, ignoring surrounding whitespace; malformed input → `0`), `INSTR([start,]
haystack, needle)` (returns `0`, not `-1`, when not found — BASIC convention, not JS's `indexOf`).

**Math**: `INT(n)` (floor — distinct from `%`-suffix coercion, which rounds; see Type-suffix
semantics), `ABS(n)`, `SQR(n)` (error on negative input), `RND[(n)]`, `SGN(n)`, `SIN`/`COS`/`TAN`.

**PRINT formatting**: `TAB(n)`, `SPC(n)`.

## Type-suffix semantics

Coercion/truncation is enforced **at assignment time** (`LET`, `FOR`-variable update, `READ`,
`INPUT`, array-element store), not on every intermediate expression — sub-expressions compute in
whatever precision naturally arises; only the destination truncates/rounds.

- `%` (integer): round-half-away-from-zero, then range-check `[-32768, 32767]`. Out-of-range
  throws an `OVERFLOW` runtime error (see Open Decisions — no silent wraparound).
- `!` / `#` (single/double): both map to JS's native `number`; kept as distinct named coercions in
  code for clarity and future precision tuning, not because v1 enforces different precision.
- `$` (string): identity coercion, but type-checks that the source is actually a string.
- String/number mismatches (e.g. `A$ = A$ + 5`) are caught by a **compile-time** semantic pass
  wherever the suffix is syntactically known — which is nearly always, since the suffix is part of
  every identifier's spelling. (A deliberate DX improvement over real interpreters, which only
  catch this at runtime.)

## Runtime error taxonomy

`SYNTAX`, `TYPE_MISMATCH`, `OVERFLOW`, `DIVISION_BY_ZERO`, `SUBSCRIPT_OUT_OF_RANGE`,
`OUT_OF_DATA`, `UNDEFINED_LINE` (raised at **compile time** as a diagnostic, not deferred to
runtime, since BASIC never computes jump targets dynamically), `RETURN_WITHOUT_GOSUB`,
`NEXT_WITHOUT_FOR`, `ILLEGAL_FUNCTION_CALL`.

## Open Decisions / Locked Defaults

These behaviors vary across real historical BASIC interpreters and weren't pinned down by a single
reference dialect. Defaults below were chosen deliberately and are considered **locked unless
revisited explicitly** — if you change one, update this section and any golden tests it affects.

- **`ON GOTO`/`ON GOSUB` out-of-range selector**: silently falls through to the next statement, no
  error raised (matches GW-BASIC).
- **`%` overflow**: throws a runtime `OVERFLOW` error. Does **not** silently wrap around.
- **`RND`/`RANDOMIZE`**: backed by a seedable PRNG (mulberry32 or similar) for deterministic
  tests. **Not** bit-compatible with any real GW-BASIC RNG sequence — golden tests that use `RND`
  must call `RANDOMIZE <fixed-seed>` for determinism; do not attempt to match real-hardware output.
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
- **Integer division `\`**: emitted as `Math.trunc(left / right)`. Real GW-BASIC may round each
  operand to an integer _before_ dividing rather than just truncating the final quotient —
  unverified; revisit in step 14/16 polish if it matters for a golden program.
- **Multi-variable `NEXT I, J`**: treated as shorthand for separate consecutive `NEXT I` / `NEXT J`
  statements (each lowers to its own independent Step, evaluated in the order written). Real BASIC
  dialects vary on the exact semantics here and it's a rare construct in practice; revisit only if
  a real-world program needs different behavior.
- **`INPUT` numeric parsing on invalid input**: falls back to `0` for unparseable numeric input,
  rather than real BASIC's `?Redo from start` re-prompt loop. Full validation-with-retry is
  deferred to step 15/16 alongside the rest of type-suffix enforcement.
- **Leading `INPUT;` form**: not supported (out of scope) — this is the syntax for suppressing the
  newline echoed after the user's response, a formatting nuance distinct from the prompt's own
  `;`/`,` separator, which _is_ fully supported.
- **Array runtime representation**: every array (1D or 2D) is one flat JS array (`{ dims, data }`)
  with a manually computed linear index, not nested arrays — keeps 1D/2D (and, though undocumented
  as supported, N-D) index computation uniform. An implementation detail, not user-visible.
- **Re-`DIM`ing an array**: silently reallocates (resets) it rather than raising GW-BASIC's
  `Redimensioned array` error. Revisit alongside step 16's error-taxonomy polish if it matters.
