# Multi-Dialect Capability Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-flag `requireGwBasic` dialect gating with a data-driven `DialectSpec`
capability model (per-dialect keyword add/drop/reject, identifier normalization, builtin-emission
overrides), consulted by the lexer, parser, and emitter — with zero observable behavior change to
the existing `classic`/`gwbasic` dialects.

**Architecture:** One `DialectSpec` object per `Dialect`, both living in `src/dialect.ts`. Public
APIs (`compile()`, `tokenize()`, `parse()`, `emit()`, the CLI's `--dialect` flag) keep taking the
plain `Dialect` string they take today; each resolves it to a `DialectSpec` internally via
`getDialectSpec()`. Five small, independently unit-testable pure functions in `src/dialect.ts`
implement the five divergence axes; the lexer/parser/emitter each call the ones relevant to them.

**Tech Stack:** TypeScript (strict, NodeNext), Vitest.

**Depends on:** [`docs/superpowers/specs/2026-08-11-multi-dialect-capability-model-design.md`](../specs/2026-08-11-multi-dialect-capability-model-design.md)
(the approved design spec — read it first for the _why_; this plan is the _how_) and the GW-BASIC
dialect extension (PR #1). **This plan assumes PR #1 is merged to `main` first** — every file
path/line reference below reflects `main` _after_ that merge, not `main`'s current state. Branch
this work from an up-to-date `main` once PR #1 lands.

## Global Constraints

- **Zero observable behavior change for `classic`/`gwbasic`.** The full existing test suite (423
  tests as of the GW-BASIC dialect extension) must pass unchanged at the end of every task — this
  is the correctness bar for the whole plan, not just a final check.
- **No new `Dialect` literal.** `Dialect` stays `"classic" | "gwbasic"` throughout this plan — see
  the spec's explicit non-goals.
- **Exact error-message text for the existing GW-BASIC dialect-gating errors must be preserved
  character-for-character** (`"OPEN is a GW-BASIC dialect extension — select the GW-BASIC dialect
to use it"`, and the `PRINT #`/`INPUT #`/`CLOSE` equivalents) — several existing tests
  (`parser.test.ts`, `tests/cli.test.ts`) assert on this exact substring.
- Run `npx tsc --noEmit` and `npx vitest run` after every task; both must be clean before moving
  to the next task.
- Relative imports in `src/**`/`tests/**` need an explicit `.js` extension (NodeNext module
  resolution) — e.g. `from "../dialect.js"` even though the file is `dialect.ts`.
- Every `switch` over an AST/Step `kind` must keep its `assertNever` exhaustiveness default case —
  this plan doesn't add new `kind`s, so no new switches need one, but don't remove existing ones
  while editing a file that has one.

---

## File Structure

| File                                                                                                  | Change                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/dialect.ts`                                                                                      | Grows: adds `DialectSpec`, `IdentifierRule`, `KeywordAvailability` types and `CLASSIC_SPEC`/`GWBASIC_SPEC`/`getDialectSpec`/`checkExtraKeywordAvailability`/`checkBaselineKeywordAvailability`/`isBuiltinAvailable`/`normalizeIdentifierName`/`isSuffixAllowed`. Kept as one file (not split into a directory) — see Task 1's note. |
| `src/dialect.test.ts`                                                                                 | New — colocated unit tests for every function `dialect.ts` adds.                                                                                                                                                                                                                                                                    |
| `src/parser/token-cursor.ts`                                                                          | `TokenCursor` gains a `dialectSpec: DialectSpec` field, resolved once at construction.                                                                                                                                                                                                                                              |
| `src/parser/parse-statements.ts`                                                                      | `requireGwBasic` replaced by a `requireDialectKeyword` helper built on `checkExtraKeywordAvailability`; same 4 call sites (OPEN/CLOSE/PRINT #/INPUT #).                                                                                                                                                                             |
| `src/parser/parse-expressions.ts`                                                                     | The `GWBASIC_ONLY_BUILTINS`-specific check replaced by `isBuiltinAvailable(cursor.dialectSpec, calleeKey)`.                                                                                                                                                                                                                         |
| `src/parser/builtins.ts`                                                                              | `GWBASIC_ONLY_BUILTINS` removed (superseded by `dialect.ts`'s `extraBuiltins` field).                                                                                                                                                                                                                                               |
| `src/lexer/lexer.ts`                                                                                  | `tokenize(source, dialect?)` gains the dialect parameter; identifier-scanning branch calls `normalizeIdentifierName`/`isSuffixAllowed`.                                                                                                                                                                                             |
| `src/cli/commands/run.ts`                                                                             | Its direct `tokenize(source)` call (for `--emit-ast`/`--emit-steps`) becomes `tokenize(source, dialect)`.                                                                                                                                                                                                                           |
| `src/emitter/runtime-calls.ts`                                                                        | Adds `resolveRuntimeCall(calleeKey, overrides)`.                                                                                                                                                                                                                                                                                    |
| `src/emitter/emit-expressions.ts`                                                                     | `emitExpression` gains a `builtinOverrides` parameter (third, defaulted) alongside the existing `locals`; exports a shared `NO_BUILTIN_OVERRIDES` sentinel.                                                                                                                                                                         |
| `src/emitter/emit-statements.ts`, `emit-print.ts`, `emit-input.ts`, `emit-read.ts`, `emit-fn-defs.ts` | Each threads `builtinOverrides` through their own signature to every `emitExpression(...)` call they make.                                                                                                                                                                                                                          |
| `src/emitter/emit-program.ts`                                                                         | `emit(lowered, dialect?)` gains the dialect parameter, resolves `builtinOverrides` once, passes it down.                                                                                                                                                                                                                            |
| `src/index.ts`                                                                                        | `compile()` passes `dialect` to `emit()` too (already passes it to `parse()`).                                                                                                                                                                                                                                                      |
| `DIALECT.md`                                                                                          | New "Adding a dialect" recipe.                                                                                                                                                                                                                                                                                                      |
| `CLAUDE.md`                                                                                           | `src/dialect.ts`'s header-comment summary and Progress notes corrected to describe the real (lexer + parser + emitter) threading.                                                                                                                                                                                                   |

---

### Task 1: `DialectSpec` capability model in `src/dialect.ts`

**Files:**

- Modify: `src/dialect.ts` (full rewrite — see below)
- Test: `src/dialect.test.ts` (new)

**Interfaces:**

- Produces (used by every later task):
  - `export type Dialect = "classic" | "gwbasic";` (unchanged)
  - `export const DEFAULT_DIALECT: Dialect;` (unchanged)
  - `export type IdentifierRule = "full" | { readonly significantChars: number };`
  - `export type KeywordAvailability = { readonly ok: true } | { readonly ok: false; readonly message: string };`
  - `export interface DialectSpec { readonly id: Dialect; readonly displayName: string; readonly extraKeywords: ReadonlySet<string>; readonly droppedKeywords: ReadonlySet<string>; readonly unsupportedKeywords: ReadonlyMap<string, string>; readonly extraBuiltins: ReadonlySet<string>; readonly identifierRule: IdentifierRule; readonly disallowedSuffixes: ReadonlySet<TypeSuffix>; readonly builtinOverrides: ReadonlyMap<string, (args: readonly string[]) => string>; }`
  - `export function getDialectSpec(dialect: Dialect): DialectSpec;`
  - `export function checkExtraKeywordAvailability(spec: DialectSpec, keyword: string): KeywordAvailability;`
  - `export function checkBaselineKeywordAvailability(spec: DialectSpec, keyword: string): KeywordAvailability;`
  - `export function isBuiltinAvailable(spec: DialectSpec, calleeKey: string): boolean;`
  - `export function normalizeIdentifierName(word: string, rule: IdentifierRule): string;`
  - `export function isSuffixAllowed(suffix: TypeSuffix, spec: DialectSpec): boolean;`

Note on file layout: this stays one file (not split into `src/dialect/{types,specs,index}.ts`) —
it's still one cohesive concept ("what is a BASIC dialect") and every existing import site
(`from "../dialect.js"`, `from "../../dialect.js"`, etc. — there are ~10 of them across the
codebase) keeps working unchanged. Revisit only once a real third dialect makes the file
genuinely large, matching how `CLAUDE.md`'s "Future: multiple language pairs" section already
treats this kind of generalization-timing question.

- [ ] **Step 1: Write the failing tests**

Create `src/dialect.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  checkBaselineKeywordAvailability,
  checkExtraKeywordAvailability,
  getDialectSpec,
  isBuiltinAvailable,
  isSuffixAllowed,
  normalizeIdentifierName,
  type DialectSpec,
} from "./dialect.js";

describe("getDialectSpec", () => {
  it("classic has no extra keywords, dropped keywords, or builtin restrictions", () => {
    const spec = getDialectSpec("classic");
    expect(spec.id).toBe("classic");
    expect(spec.extraKeywords.size).toBe(0);
    expect(spec.droppedKeywords.size).toBe(0);
    expect(spec.unsupportedKeywords.size).toBe(0);
    expect(spec.extraBuiltins.size).toBe(0);
    expect(spec.identifierRule).toBe("full");
    expect(spec.disallowedSuffixes.size).toBe(0);
    expect(spec.builtinOverrides.size).toBe(0);
  });

  it("gwbasic adds exactly OPEN/CLOSE/PRINT #/INPUT # and the eof builtin", () => {
    const spec = getDialectSpec("gwbasic");
    expect(spec.id).toBe("gwbasic");
    expect([...spec.extraKeywords].sort()).toEqual(["CLOSE", "INPUT #", "OPEN", "PRINT #"]);
    expect(spec.extraBuiltins.has("eof")).toBe(true);
    expect(spec.droppedKeywords.size).toBe(0);
    expect(spec.unsupportedKeywords.size).toBe(0);
    expect(spec.builtinOverrides.size).toBe(0);
  });
});

describe("checkExtraKeywordAvailability", () => {
  it("allows a keyword this dialect's own spec lists", () => {
    const spec = getDialectSpec("gwbasic");
    expect(checkExtraKeywordAvailability(spec, "OPEN")).toEqual({ ok: true });
  });

  it("rejects a GW-BASIC-only keyword under classic with the exact existing message", () => {
    const spec = getDialectSpec("classic");
    const result = checkExtraKeywordAvailability(spec, "OPEN");
    expect(result).toEqual({
      ok: false,
      message: "OPEN is a GW-BASIC dialect extension — select the GW-BASIC dialect to use it",
    });
  });

  it("rejects PRINT #/INPUT # under classic with their own exact messages", () => {
    expect(checkExtraKeywordAvailability(getDialectSpec("classic"), "PRINT #")).toEqual({
      ok: false,
      message: "PRINT # is a GW-BASIC dialect extension — select the GW-BASIC dialect to use it",
    });
    expect(checkExtraKeywordAvailability(getDialectSpec("classic"), "INPUT #")).toEqual({
      ok: false,
      message: "INPUT # is a GW-BASIC dialect extension — select the GW-BASIC dialect to use it",
    });
  });

  it("an unsupported-keyword entry takes priority over the extra-keyword check", () => {
    const synthetic: DialectSpec = {
      id: "classic",
      displayName: "Synthetic",
      extraKeywords: new Set(),
      droppedKeywords: new Set(),
      unsupportedKeywords: new Map([
        [
          "PEEK",
          "PEEK is not supported by basic2js: no meaningful JavaScript equivalent for direct memory access",
        ],
      ]),
      extraBuiltins: new Set(),
      identifierRule: "full",
      disallowedSuffixes: new Set(),
      builtinOverrides: new Map(),
    };
    expect(checkExtraKeywordAvailability(synthetic, "PEEK")).toEqual({
      ok: false,
      message:
        "PEEK is not supported by basic2js: no meaningful JavaScript equivalent for direct memory access",
    });
  });
});

describe("checkBaselineKeywordAvailability", () => {
  it("allows a baseline keyword by default", () => {
    expect(checkBaselineKeywordAvailability(getDialectSpec("classic"), "WHILE")).toEqual({
      ok: true,
    });
  });

  it("rejects a keyword this synthetic dialect explicitly drops", () => {
    const synthetic: DialectSpec = {
      id: "classic",
      displayName: "No-WHILE BASIC",
      extraKeywords: new Set(),
      droppedKeywords: new Set(["WHILE", "WEND"]),
      unsupportedKeywords: new Map(),
      extraBuiltins: new Set(),
      identifierRule: "full",
      disallowedSuffixes: new Set(),
      builtinOverrides: new Map(),
    };
    expect(checkBaselineKeywordAvailability(synthetic, "WHILE")).toEqual({
      ok: false,
      message: 'WHILE is not available in the "classic" dialect',
    });
  });
});

describe("isBuiltinAvailable", () => {
  it("a universal builtin (e.g. LEN) is available under every dialect", () => {
    expect(isBuiltinAvailable(getDialectSpec("classic"), "len")).toBe(true);
    expect(isBuiltinAvailable(getDialectSpec("gwbasic"), "len")).toBe(true);
  });

  it("eof is only available under gwbasic", () => {
    expect(isBuiltinAvailable(getDialectSpec("classic"), "eof")).toBe(false);
    expect(isBuiltinAvailable(getDialectSpec("gwbasic"), "eof")).toBe(true);
  });
});

describe("normalizeIdentifierName", () => {
  it("'full' just lowercases, matching the lexer's existing behavior", () => {
    expect(normalizeIdentifierName("SCORE", "full")).toBe("score");
  });

  it("a significantChars rule truncates after lowercasing", () => {
    expect(normalizeIdentifierName("SCORE", { significantChars: 2 })).toBe("sc");
    expect(normalizeIdentifierName("SCALE", { significantChars: 2 })).toBe("sc");
  });

  it("a significantChars rule longer than the word is a no-op", () => {
    expect(normalizeIdentifierName("X", { significantChars: 2 })).toBe("x");
  });
});

describe("isSuffixAllowed", () => {
  it("every suffix is allowed under classic/gwbasic", () => {
    const spec = getDialectSpec("classic");
    expect(isSuffixAllowed("%", spec)).toBe(true);
    expect(isSuffixAllowed("!", spec)).toBe(true);
    expect(isSuffixAllowed("#", spec)).toBe(true);
    expect(isSuffixAllowed("$", spec)).toBe(true);
  });

  it("a synthetic dialect can disallow a suffix", () => {
    const synthetic: DialectSpec = {
      id: "classic",
      displayName: "No-precision BASIC",
      extraKeywords: new Set(),
      droppedKeywords: new Set(),
      unsupportedKeywords: new Map(),
      extraBuiltins: new Set(),
      identifierRule: "full",
      disallowedSuffixes: new Set(["!", "#"]),
      builtinOverrides: new Map(),
    };
    expect(isSuffixAllowed("!", synthetic)).toBe(false);
    expect(isSuffixAllowed("#", synthetic)).toBe(false);
    expect(isSuffixAllowed("$", synthetic)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/dialect.test.ts`
Expected: FAIL — every import from `./dialect.js` errors, since none of these exports exist yet
(only `Dialect`/`DEFAULT_DIALECT` currently do).

- [ ] **Step 3: Write the implementation**

Replace `src/dialect.ts` entirely with:

```typescript
// The BASIC dialect a program is compiled against, and the DialectSpec
// capability model that expresses how each dialect actually diverges from
// the others — see docs/superpowers/specs/2026-08-11-multi-dialect-capability-model-design.md
// for the full design rationale.
//
// Threaded through three pipeline stages, each for one specific reason:
//   - the LEXER (see lexer/lexer.ts's tokenize()) -- identifier
//     normalization: a dialect that truncates variable names to N
//     significant characters (e.g. Applesoft/Commodore BASIC's real
//     2-character rule -- not implemented by any dialect here yet, see
//     DIALECT.md's "Adding a dialect" recipe) has to fold
//     same-truncation identifiers together at the same point case-folding
//     already happens, before the parser ever sees them.
//   - the PARSER (see parser/token-cursor.ts) -- keyword/builtin gating,
//     generalizing the original GW-BASIC dialect extension's
//     requireGwBasic (see checkExtraKeywordAvailability/
//     checkBaselineKeywordAvailability/isBuiltinAvailable below).
//   - the EMITTER (see emitter/emit-expressions.ts) -- a builtin's JS
//     emission can be overridden per dialect (e.g. a dialect where
//     RND(n) has real per-argument semantics, unlike gwbasic's "ignore
//     n" simplification), via DialectSpec.builtinOverrides.
// Semantic analysis and lowering remain entirely dialect-agnostic -- by
// construction, a dialect-gated AST node can only exist at all if the
// parser already confirmed the right dialect was active when it parsed
// it, so nothing past parsing needs to re-check dialect for gating
// purposes, and neither analysis nor lowering needs behavioral overrides.
//
// - `"classic"` (the default): the original locked spec -- see DIALECT.md.
// - `"gwbasic"`: `"classic"` plus GW-BASIC's sequential file I/O
//   (`OPEN`/`CLOSE`/`PRINT #`/`INPUT #`/`EOF()`) -- see DIALECT.md's
//   "GW-BASIC dialect extension" section for exact semantics.
//
// Adding a third dialect: see DIALECT.md's "Adding a dialect" recipe.

import type { TypeSuffix } from "./ast/types.js";

export type Dialect = "classic" | "gwbasic";

export const DEFAULT_DIALECT: Dialect = "classic";

/**
 * How this dialect normalizes an identifier's base name (before the
 * %/!/#/$ suffix, if any, is appended back on) -- `"full"` keeps the
 * whole (already lowercased) name, matching classic/gwbasic's unchanged
 * behavior; `{ significantChars: n }` truncates to the first `n`
 * characters, so two names that only differ after that point become the
 * same variable (Applesoft/Commodore BASIC's real "only the first 2
 * characters are significant" rule).
 */
export type IdentifierRule = "full" | { readonly significantChars: number };

/** Result of a keyword-availability check -- see checkExtraKeywordAvailability/checkBaselineKeywordAvailability. */
export type KeywordAvailability =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * The full set of ways a dialect can diverge from another. Every dialect
 * -- including "classic" and "gwbasic" -- has one of these; "classic"'s
 * is the near-empty implicit baseline (see CLASSIC_SPEC below).
 */
export interface DialectSpec {
  readonly id: Dialect;

  /**
   * A short, human-readable name used ONLY to build compiler error
   * messages (e.g. "GW-BASIC" in "OPEN is a GW-BASIC dialect
   * extension..."). Deliberately distinct from the web UI's own dialect
   * dropdown labels (web/src/components/DialectSelector) -- that's a
   * separate UI-layer concern with its own wording needs (e.g. "GW-BASIC
   * (file I/O)"), not something this compiler-core type should own.
   */
  readonly displayName: string;

  /**
   * Gated construct identifiers this dialect adds beyond the shared
   * baseline (generalizes gwbasic's OPEN/CLOSE/PRINT #/INPUT #). Not
   * necessarily 1:1 with lexer.ts's keyword table -- a real lexer keyword
   * like "OPEN" and a gated *form* of an existing baseline keyword like
   * "PRINT #" are both just opaque string labels here, matching exactly
   * what checkExtraKeywordAvailability's caller passes at each of the
   * (currently 4) parser gating call sites.
   */
  readonly extraKeywords: ReadonlySet<string>;

  /** Baseline keywords ("classic" has them) this dialect deliberately lacks (e.g. a dialect with no WHILE/WEND). Empty for classic/gwbasic -- neither drops anything. */
  readonly droppedKeywords: ReadonlySet<string>;

  /** Keywords recognized as real BASIC syntax by some dialect's vocabulary, but with no meaningful JS translation at all (e.g. PEEK/POKE) -- keyword -> the exact ParseError message to raise. Checked before extraKeywords/droppedKeywords in both availability checks below, so it applies regardless of which other axis a keyword would otherwise fall under. Empty for classic/gwbasic. */
  readonly unsupportedKeywords: ReadonlyMap<string, string>;

  /** Builtin function names (see parser/builtins.ts's BUILTIN_FUNCTIONS) ONLY this dialect reserves in call position (e.g. gwbasic's "eof"). Generalizes the original GWBASIC_ONLY_BUILTINS. */
  readonly extraBuiltins: ReadonlySet<string>;

  /** How this dialect normalizes identifier base names -- see IdentifierRule. */
  readonly identifierRule: IdentifierRule;

  /** Type suffixes (%/!/#/$) this dialect doesn't have (e.g. a dialect with only 5-byte floats has no "!"/"#" precision suffixes). Empty for classic/gwbasic. */
  readonly disallowedSuffixes: ReadonlySet<TypeSuffix>;

  /** Same builtin name/arity as the shared table (emitter/runtime-calls.ts's RUNTIME_CALLS), but different JS emission under this dialect (e.g. a dialect where RND(n) has real per-argument semantics). Checked before the shared table -- see emitter/runtime-calls.ts's resolveRuntimeCall. Empty for classic/gwbasic. */
  readonly builtinOverrides: ReadonlyMap<string, (args: readonly string[]) => string>;
}

const CLASSIC_SPEC: DialectSpec = {
  id: "classic",
  displayName: "Classic BASIC",
  extraKeywords: new Set(),
  droppedKeywords: new Set(),
  unsupportedKeywords: new Map(),
  extraBuiltins: new Set(),
  identifierRule: "full",
  disallowedSuffixes: new Set(),
  builtinOverrides: new Map(),
};

const GWBASIC_SPEC: DialectSpec = {
  id: "gwbasic",
  displayName: "GW-BASIC",
  // "PRINT #"/"INPUT #" are gated *forms* of the baseline PRINT/INPUT
  // keywords, not separate lexer keywords -- see the doc comment on
  // extraKeywords above.
  extraKeywords: new Set(["OPEN", "CLOSE", "PRINT #", "INPUT #"]),
  droppedKeywords: new Set(),
  unsupportedKeywords: new Map(),
  extraBuiltins: new Set(["eof"]),
  identifierRule: "full",
  disallowedSuffixes: new Set(),
  builtinOverrides: new Map(),
};

const DIALECT_SPECS: Readonly<Record<Dialect, DialectSpec>> = {
  classic: CLASSIC_SPEC,
  gwbasic: GWBASIC_SPEC,
};

/** Resolves a `Dialect` literal to its full `DialectSpec`. */
export function getDialectSpec(dialect: Dialect): DialectSpec {
  return DIALECT_SPECS[dialect];
}

/**
 * The dialect (if any) whose `extraKeywords` lists a given gated
 * construct identifier -- built once from every registered spec, so
 * checkExtraKeywordAvailability's failure message can name which dialect
 * actually supports the thing being rejected (e.g. "select the GW-BASIC
 * dialect"), without each check needing to scan every spec itself.
 * Assumes at most one dialect owns any given identifier -- true for
 * every dialect registered today; revisit if that ever stops holding.
 */
const KEYWORD_OWNER: ReadonlyMap<string, DialectSpec> = new Map(
  Object.values(DIALECT_SPECS).flatMap((spec) =>
    [...spec.extraKeywords].map((keyword) => [keyword, spec] as const),
  ),
);

/**
 * Availability check for a gated construct that only exists because SOME
 * dialect adds it (e.g. OPEN, or PRINT #) -- available only if the given
 * dialect's own spec explicitly lists it in `extraKeywords`. Generalizes
 * the original requireGwBasic (parser/parse-statements.ts).
 */
export function checkExtraKeywordAvailability(
  spec: DialectSpec,
  keyword: string,
): KeywordAvailability {
  const unsupportedReason = spec.unsupportedKeywords.get(keyword);
  if (unsupportedReason !== undefined) return { ok: false, message: unsupportedReason };
  if (spec.extraKeywords.has(keyword)) return { ok: true };
  const owner = KEYWORD_OWNER.get(keyword);
  const dialectName = owner?.displayName ?? "a different";
  return {
    ok: false,
    message: `${keyword} is a ${dialectName} dialect extension — select the ${dialectName} dialect to use it`,
  };
}

/**
 * Availability check for a baseline ("classic") keyword (e.g. WHILE) --
 * available by default, unless this dialect explicitly drops or rejects
 * it. Not wired into any real parser call site yet -- no dialect drops a
 * baseline keyword today -- but exercised directly by dialect.test.ts's
 * synthetic-dialect coverage; see DIALECT.md's "Adding a dialect" recipe
 * for where a future dialect would call this.
 */
export function checkBaselineKeywordAvailability(
  spec: DialectSpec,
  keyword: string,
): KeywordAvailability {
  const unsupportedReason = spec.unsupportedKeywords.get(keyword);
  if (unsupportedReason !== undefined) return { ok: false, message: unsupportedReason };
  if (spec.droppedKeywords.has(keyword)) {
    return { ok: false, message: `${keyword} is not available in the "${spec.id}" dialect` };
  }
  return { ok: true };
}

/**
 * The union of every registered dialect's `extraBuiltins` -- lets a
 * single dialect's availability check distinguish "this builtin is
 * universal" from "this builtin is owned by SOME dialect, just maybe not
 * this one" without iterating every spec per call. Generalizes the
 * original GWBASIC_ONLY_BUILTINS (parser/builtins.ts).
 */
const DIALECT_RESTRICTED_BUILTINS: ReadonlySet<string> = new Set(
  Object.values(DIALECT_SPECS).flatMap((spec) => [...spec.extraBuiltins]),
);

/**
 * True if `calleeKey` (a lowercase `name+suffix` builtin-function spelling
 * -- see parser/builtins.ts) is reserved in call position under `spec`:
 * either it's a universal builtin (owned by no dialect's extraBuiltins at
 * all) or `spec` itself is the dialect that adds it.
 */
export function isBuiltinAvailable(spec: DialectSpec, calleeKey: string): boolean {
  return !DIALECT_RESTRICTED_BUILTINS.has(calleeKey) || spec.extraBuiltins.has(calleeKey);
}

/**
 * Normalizes an identifier's base name (lowercase, per the lexer's
 * existing convention, plus this dialect's truncation rule if any) --
 * called from lexer.ts's identifier-scanning branch, BEFORE the %/!/#/$
 * suffix (if any) is appended back on, so e.g. Applesoft/Commodore's
 * 2-significant-character rule only ever truncates the name portion.
 */
export function normalizeIdentifierName(word: string, rule: IdentifierRule): string {
  const lower = word.toLowerCase();
  return rule === "full" ? lower : lower.slice(0, rule.significantChars);
}

/** True if `suffix` (a real, non-empty type suffix character) is legal under `spec`. */
export function isSuffixAllowed(suffix: TypeSuffix, spec: DialectSpec): boolean {
  return !spec.disallowedSuffixes.has(suffix);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/dialect.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — nothing else imports the new exports yet, so this only confirms nothing existing
broke (the file's public `Dialect`/`DEFAULT_DIALECT` exports are unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/dialect.ts src/dialect.test.ts
git commit -m "Add DialectSpec capability model to src/dialect.ts

Introduces the data-driven dialect model from the multi-dialect
capability model design spec: DialectSpec (extraKeywords/
droppedKeywords/unsupportedKeywords/extraBuiltins/identifierRule/
disallowedSuffixes/builtinOverrides) plus five small pure helper
functions implementing each axis. classic/gwbasic both get a spec;
gwbasic's expresses exactly what requireGwBasic's four call sites
express today. Nothing consumes these yet -- wiring is the next
several tasks."
```

---

### Task 2: Generalize parser gating onto `DialectSpec`

**Files:**

- Modify: `src/parser/token-cursor.ts`
- Modify: `src/parser/parse-statements.ts`
- Modify: `src/parser/parse-expressions.ts`
- Modify: `src/parser/builtins.ts`

**Interfaces:**

- Consumes: `DialectSpec`, `getDialectSpec`, `checkExtraKeywordAvailability`, `isBuiltinAvailable`
  from Task 1 (`src/dialect.js`).
- Produces: `TokenCursor.dialectSpec: DialectSpec` (new field), consumed by every later parser
  change and by Task 3 indirectly (no dependency, just noting the field exists for future use).

- [ ] **Step 1: Update `TokenCursor` to resolve and expose `dialectSpec`**

Replace `src/parser/token-cursor.ts` entirely with (only the imports and constructor body differ
from the current file — every method below the constructor, and the two module-level helpers at
the bottom, are byte-for-byte unchanged):

```typescript
// A small mutable cursor over a Token[], shared by parser.ts,
// parse-statements.ts, and parse-expressions.ts. Chosen over threading a
// plain numeric position index through every parse function's parameters
// and return values (the shape the original stub sketched) — a cursor
// object is harder to get wrong (no risk of forgetting to propagate an
// updated position) and keeps every parse function's signature to just
// `(cursor: TokenCursor) => Node`.

import type { Token, TokenType } from "../lexer/token.js";
import type { Dialect, DialectSpec } from "../dialect.js";
import { DEFAULT_DIALECT, getDialectSpec } from "../dialect.js";
import { ParseError } from "./errors.js";

export class TokenCursor {
  private pos = 0;
  /** The active dialect's full capability spec — see src/dialect.ts. Resolved once here so every dialect-gated parse function reads it straight off the cursor. */
  readonly dialectSpec: DialectSpec;

  constructor(
    private readonly tokens: readonly Token[],
    /** Which BASIC dialect is being parsed — see src/dialect.ts. Read by dialect-gated parse functions (e.g. parseOpenStmt) directly off the cursor, rather than threading a second parameter through every parse function. */
    readonly dialect: Dialect = DEFAULT_DIALECT,
  ) {
    if (tokens.length === 0) {
      throw new Error("TokenCursor: token stream must at least contain an EOF token");
    }
    this.dialectSpec = getDialectSpec(dialect);
  }

  /** The token `offset` positions ahead of the cursor (0 = current). Clamps at EOF. */
  peek(offset = 0): Token {
    const index = Math.min(this.pos + offset, this.tokens.length - 1);
    // Safe: constructor guarantees at least one token, and index is clamped
    // into range, so this is never actually undefined.
    return this.tokens[index] as Token;
  }

  current(): Token {
    return this.peek(0);
  }

  /** Consumes and returns the current token. Never advances past EOF. */
  advance(): Token {
    const token = this.current();
    if (token.type !== "EOF") this.pos++;
    return token;
  }

  check(type: TokenType, text?: string): boolean {
    const token = this.current();
    return token.type === type && (text === undefined || token.text === text);
  }

  /** If the current token matches, consumes it and returns true; otherwise leaves the cursor untouched. */
  match(type: TokenType, text?: string): boolean {
    if (this.check(type, text)) {
      this.advance();
      return true;
    }
    return false;
  }

  /** Consumes and returns the current token if it matches, else throws a ParseError. */
  expect(type: TokenType, text?: string): Token {
    if (!this.check(type, text)) {
      const token = this.current();
      throw new ParseError(
        `Expected ${describeExpected(type, text)}, found ${describeToken(token)}`,
        token.line,
        token.col,
      );
    }
    return this.advance();
  }
}

function describeExpected(type: TokenType, text?: string): string {
  if (text !== undefined) return `"${text}"`;
  return type;
}

function describeToken(token: Token): string {
  if (token.type === "EOF") return "end of input";
  if (token.type === "EOL") return "end of line";
  return `"${token.text}"`;
}
```

(Everything below the constructor in the existing file — `peek`, `current`, `advance`, `check`,
`match`, `expect`, and the two module-level `describeExpected`/`describeToken` helpers — stays
exactly as-is; only the imports and constructor body change.)

- [ ] **Step 2: Run typecheck to verify `TokenCursor` compiles**

Run: `npx tsc --noEmit`
Expected: PASS (nothing consumes `dialectSpec` yet, so no downstream errors).

- [ ] **Step 3: Replace `requireGwBasic` in `parse-statements.ts`**

In `src/parser/parse-statements.ts`, find this function (around line 76-89):

```typescript
/**
 * Throws a clear ParseError if `cursor.dialect` isn't `"gwbasic"` — guards
 * every GW-BASIC-only construct (OPEN/CLOSE, PRINT #/INPUT #'s file-number
 * form — see src/dialect.ts). `token` supplies the error's line/col,
 * typically the keyword/operator token that triggered the check.
 */
function requireGwBasic(cursor: TokenCursor, token: Token, feature: string): void {
  if (cursor.dialect !== "gwbasic") {
    throw new ParseError(
      `${feature} is a GW-BASIC dialect extension — select the GW-BASIC dialect to use it`,
      token.line,
      token.col,
    );
  }
}
```

Replace it with:

```typescript
/**
 * Throws a clear ParseError if `keyword` isn't available under the active
 * dialect — guards every gated construct (OPEN/CLOSE, PRINT #/INPUT #'s
 * file-number form — see src/dialect.ts). `token` supplies the error's
 * line/col, typically the keyword/operator token that triggered the
 * check. Thin wrapper around dialect.ts's checkExtraKeywordAvailability,
 * which does the actual per-dialect lookup.
 */
function requireDialectKeyword(cursor: TokenCursor, token: Token, keyword: string): void {
  const result = checkExtraKeywordAvailability(cursor.dialectSpec, keyword);
  if (!result.ok) {
    throw new ParseError(result.message, token.line, token.col);
  }
}
```

Add the import at the top of the file (alongside the existing imports):

```typescript
import { checkExtraKeywordAvailability } from "../dialect.js";
```

Then update all 4 call sites (the arguments are unchanged, only the function name changes):

- `requireGwBasic(cursor, printToken, "PRINT #");` → `requireDialectKeyword(cursor, printToken, "PRINT #");`
- `requireGwBasic(cursor, inputToken, "INPUT #");` → `requireDialectKeyword(cursor, inputToken, "INPUT #");`
- `requireGwBasic(cursor, openToken, "OPEN");` → `requireDialectKeyword(cursor, openToken, "OPEN");`
- `requireGwBasic(cursor, closeToken, "CLOSE");` → `requireDialectKeyword(cursor, closeToken, "CLOSE");`

- [ ] **Step 4: Replace the `GWBASIC_ONLY_BUILTINS` check in `parse-expressions.ts`**

In `src/parser/parse-expressions.ts`, change the import line:

```typescript
import { lookupBuiltin } from "./builtins.js";
```

(removing `GWBASIC_ONLY_BUILTINS` from that import) and add:

```typescript
import { isBuiltinAvailable } from "../dialect.js";
```

Then find this block inside `parsePrimary`:

```typescript
      const builtin = lookupBuiltin(calleeKey);
      // A GW-BASIC-only builtin (currently just EOF) is only reserved when
      // that dialect is active (see src/dialect.ts) — otherwise it's
      // treated exactly as if it weren't in the registry at all, falling
      // through to the ordinary ArrayRef case below.
      if (
        builtin !== undefined &&
        (!GWBASIC_ONLY_BUILTINS.has(calleeKey) || cursor.dialect === "gwbasic")
      ) {
```

Replace with:

```typescript
      const builtin = lookupBuiltin(calleeKey);
      // A dialect-restricted builtin (currently just gwbasic's EOF) is
      // only reserved when its owning dialect is active (see
      // src/dialect.ts) — otherwise it's treated exactly as if it weren't
      // in the registry at all, falling through to the ordinary ArrayRef
      // case below.
      if (builtin !== undefined && isBuiltinAvailable(cursor.dialectSpec, calleeKey)) {
```

- [ ] **Step 5: Remove `GWBASIC_ONLY_BUILTINS` from `builtins.ts`**

In `src/parser/builtins.ts`, delete this line:

```typescript
export const GWBASIC_ONLY_BUILTINS: ReadonlySet<string> = new Set(["eof"]);
```

Also update the file's header comment: find the paragraph starting `// GWBASIC_ONLY_BUILTINS
marks the (currently one-member) subset...` and replace it with:

```typescript
// Dialect-restricted builtins (currently just gwbasic's "eof") are marked
// via each dialect's own DialectSpec.extraBuiltins (see src/dialect.ts) --
// parse-expressions.ts's parsePrimary checks isBuiltinAvailable alongside
// lookupBuiltin. In a dialect that doesn't add a given restricted
// builtin, that name is treated exactly as if it weren't in
// BUILTIN_FUNCTIONS at all (an ordinary variable/array, never reserved)
// -- unlike every universal builtin, which is reserved in call position
// under every dialect.
```

- [ ] **Step 6: Run the full parser test suite**

Run: `npx vitest run src/parser/`
Expected: PASS — all 98 existing `parser.test.ts` tests pass unchanged, including the
dialect-gating tests asserting the exact `"OPEN is a GW-BASIC dialect extension"`-style messages
(Task 1's `KEYWORD_OWNER`-based reconstruction reproduces them character-for-character).

- [ ] **Step 7: Run full typecheck and test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/parser/token-cursor.ts src/parser/parse-statements.ts src/parser/parse-expressions.ts src/parser/builtins.ts
git commit -m "Generalize parser dialect gating onto DialectSpec

TokenCursor resolves and exposes dialectSpec (from src/dialect.ts's
getDialectSpec) alongside the existing dialect field. requireGwBasic
becomes requireDialectKeyword, built on checkExtraKeywordAvailability
-- same 4 call sites (OPEN/CLOSE/PRINT #/INPUT #), same exact error
messages (verified by the existing parser.test.ts/cli.test.ts
assertions on that literal text). parse-expressions.ts's
GWBASIC_ONLY_BUILTINS check becomes isBuiltinAvailable; builtins.ts
loses the now-superseded GWBASIC_ONLY_BUILTINS export. Zero behavior
change -- full existing suite still green."
```

---

### Task 3: Dialect-aware lexer (identifier normalization + disallowed suffixes)

**Files:**

- Modify: `src/lexer/lexer.ts`
- Modify: `src/cli/commands/run.ts`
- Test: `src/lexer/lexer.test.ts`

**Interfaces:**

- Consumes: `Dialect`, `DEFAULT_DIALECT`, `getDialectSpec`, `normalizeIdentifierName`,
  `isSuffixAllowed` from Task 1 (`src/dialect.js`).
- Produces: `tokenize(source: string, dialect: Dialect = DEFAULT_DIALECT): Token[]` (new second
  parameter, defaulted — every existing call site with just `tokenize(source)` keeps compiling).

- [ ] **Step 1: Write the failing test**

`normalizeIdentifierName`/`isSuffixAllowed` themselves are already fully covered by Task 1's
`dialect.test.ts` (truncation, disallowed suffixes) — no real dialect truncates identifiers or
disallows a suffix yet, so there's nothing new to prove _behaviorally_ through `tokenize()` itself.
This task's own test just pins that `tokenize()` correctly accepts and threads a `dialect` argument
through to those already-proven-correct helpers, with no change in output for `classic`/`gwbasic`
(both use the identity-equivalent `identifierRule: "full"` / empty `disallowedSuffixes`).

Add to `src/lexer/lexer.test.ts` (append a new `describe` block at the end of the file):

```typescript
describe("tokenize — dialect threading", () => {
  it("still lowercases identifiers under the default dialect (regression pin)", () => {
    const tokens = tokenize("10 LET SCORE = 1");
    const identifier = tokens.find((t) => t.type === "Identifier");
    expect(identifier?.text).toBe("score");
  });

  it("accepts an explicit dialect argument with no change in behavior for classic/gwbasic", () => {
    const classicTokens = tokenize("10 LET SCORE = 1", "classic");
    const gwbasicTokens = tokenize("10 LET SCORE = 1", "gwbasic");
    expect(classicTokens.find((t) => t.type === "Identifier")?.text).toBe("score");
    expect(gwbasicTokens.find((t) => t.type === "Identifier")?.text).toBe("score");
  });
});
```

- [ ] **Step 2: Run the tests to verify the second one fails**

Run: `npx vitest run src/lexer/lexer.test.ts`
Expected: The first test passes already (no behavior change needed for it); the second FAILS to
typecheck/run — `tokenize` doesn't accept a second argument yet.

- [ ] **Step 3: Update `tokenize`'s signature and identifier-scanning branch**

In `src/lexer/lexer.ts`, add the import:

```typescript
import {
  DEFAULT_DIALECT,
  getDialectSpec,
  isSuffixAllowed,
  normalizeIdentifierName,
  type Dialect,
} from "../dialect.js";
```

Change the function signature:

```typescript
export function tokenize(source: string, dialect: Dialect = DEFAULT_DIALECT): Token[] {
  const spec = getDialectSpec(dialect);
  const tokens: Token[] = [];
```

(keep everything else in the function body as-is until the identifier-scanning branch).

Find this block inside the identifier-scanning branch:

```typescript
const suffix = hasSuffix ? rawLine.charAt(pos) : "";
if (hasSuffix) pos++;
const identifierText = word.toLowerCase() + suffix;
tokens.push({
  type: "Identifier",
  text: identifierText,
  value: identifierText,
  line: sourceLine,
  col: startCol,
});
continue;
```

Replace with:

```typescript
const suffix = hasSuffix ? rawLine.charAt(pos) : "";
if (hasSuffix && !isSuffixAllowed(suffix as TypeSuffix, spec)) {
  throw new LexError(
    `"${suffix}" is not a valid type suffix in the "${dialect}" dialect`,
    sourceLine,
    startCol,
  );
}
if (hasSuffix) pos++;
const identifierText = normalizeIdentifierName(word, spec.identifierRule) + suffix;
tokens.push({
  type: "Identifier",
  text: identifierText,
  value: identifierText,
  line: sourceLine,
  col: startCol,
});
continue;
```

Add the `TypeSuffix` import at the top of the file too:

```typescript
import type { TypeSuffix } from "../ast/types.js";
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lexer/lexer.test.ts`
Expected: PASS — all existing tests plus the two new ones.

- [ ] **Step 5: Update `src/cli/commands/run.ts`'s direct `tokenize()` calls**

In `src/cli/commands/run.ts`, find:

```typescript
if (options.emitAst) {
  process.stdout.write(stringifyDebugJson(parse(tokenize(source), dialect)));
  return;
}

if (options.emitSteps) {
  process.stdout.write(stringifyDebugJson(lower(parse(tokenize(source), dialect))));
  return;
}
```

Replace with:

```typescript
if (options.emitAst) {
  process.stdout.write(stringifyDebugJson(parse(tokenize(source, dialect), dialect)));
  return;
}

if (options.emitSteps) {
  process.stdout.write(stringifyDebugJson(lower(parse(tokenize(source, dialect), dialect))));
  return;
}
```

(`dialect` is already in scope — defined just above as `const dialect = options.dialect ??
DEFAULT_DIALECT;` — this only threads it into the previously dialect-blind `tokenize()` calls.)

- [ ] **Step 6: Run full typecheck and test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Manually verify `--emit-ast` still works for a GW-BASIC-dialect program**

Run:

```bash
echo '10 OPEN "A.TXT" FOR OUTPUT AS #1' > /tmp/gwtest.bas
npx tsx src/cli/index.ts run /tmp/gwtest.bas --emit-ast --dialect gwbasic
```

Expected: prints valid JSON for the parsed `Program` AST (containing an `OpenStmt` node), exit
code 0 — confirms `tokenize(source, dialect)` really reaches the CLI's debug path now (previously
`tokenize(source)` without a dialect would have been harmless here too, since the lexer was
dialect-agnostic before this task, but this pins the new signature is wired correctly end to end).

- [ ] **Step 8: Commit**

```bash
git add src/lexer/lexer.ts src/lexer/lexer.test.ts src/cli/commands/run.ts
git commit -m "Thread dialect through the lexer for identifier/suffix rules

tokenize(source, dialect?) resolves the active DialectSpec and applies
its identifierRule (normalizeIdentifierName) and disallowedSuffixes
(isSuffixAllowed) during identifier scanning -- both no-ops for
classic/gwbasic today (identifierRule: 'full', disallowedSuffixes:
empty), so this is a pure plumbing change with no observable behavior
difference, pinned by regression tests. cli/commands/run.ts's
--emit-ast/--emit-steps debug paths, which call tokenize() directly
(bypassing compile()), now pass dialect through too."
```

---

### Task 4: `resolveRuntimeCall` — builtin-override resolution

**Files:**

- Modify: `src/emitter/runtime-calls.ts`
- Test: `src/emitter/runtime-calls.test.ts`

**Interfaces:**

- Consumes: `DialectSpec["builtinOverrides"]`'s type shape (structurally — no new import needed,
  see Step 3's note).
- Produces: `export function resolveRuntimeCall(calleeKey: string, overrides: ReadonlyMap<string, EmitCall>): EmitCall | undefined;` — used by Task 5.

- [ ] **Step 1: Write the failing tests**

Add to `src/emitter/runtime-calls.test.ts` (append a new `describe` block):

```typescript
describe("resolveRuntimeCall", () => {
  it("falls back to the shared RUNTIME_CALLS table when there's no override", () => {
    const result = resolveRuntimeCall("len", new Map());
    expect(result).toBeDefined();
    expect(result!(["x"])).toBe("x.length");
  });

  it("returns undefined for a name in neither the overrides nor the shared table", () => {
    expect(resolveRuntimeCall("not_a_real_builtin", new Map())).toBeUndefined();
  });

  it("prefers an override over the shared table's own entry for the same name", () => {
    const overrides = new Map<string, (args: readonly string[]) => string>([
      ["rnd", () => "__dialectSpecificRnd()"],
    ]);
    const result = resolveRuntimeCall("rnd", overrides);
    expect(result).toBeDefined();
    expect(result!([])).toBe("__dialectSpecificRnd()");
  });

  it("an override for a name with no shared-table entry at all still resolves", () => {
    const overrides = new Map<string, (args: readonly string[]) => string>([
      ["peek", (a) => `__peek(${a[0]})`],
    ]);
    const result = resolveRuntimeCall("peek", overrides);
    expect(result).toBeDefined();
    expect(result!(["1"])).toBe("__peek(1)");
  });
});
```

Change the file's existing import line (currently `import { builtinKeysMatch, RUNTIME_CALLS } from
"./runtime-calls.js";`) to add `resolveRuntimeCall`:

```typescript
import { builtinKeysMatch, resolveRuntimeCall, RUNTIME_CALLS } from "./runtime-calls.js";
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/emitter/runtime-calls.test.ts`
Expected: FAIL — `resolveRuntimeCall` doesn't exist yet (import error).

- [ ] **Step 3: Implement `resolveRuntimeCall`**

In `src/emitter/runtime-calls.ts`, add at the end of the file (after `builtinKeysMatch`):

```typescript
/**
 * Resolves `calleeKey`'s JS-emission function, checking `overrides`
 * (a dialect's DialectSpec.builtinOverrides — see src/dialect.ts) before
 * falling back to the shared RUNTIME_CALLS table. Takes just the
 * overrides map, not a full DialectSpec, so this stays testable and
 * usable in isolation from the rest of the dialect model — the same
 * "thread the narrowest useful value" choice emit-expressions.ts's
 * `locals` parameter already makes.
 *
 * The parameter type is written out structurally (matching EmitCall's own
 * shape) rather than importing DialectSpec here — runtime-calls.ts is an
 * emitter-layer module; src/dialect.ts is lower-level and imported BY the
 * emitter, never the other way around.
 */
export function resolveRuntimeCall(
  calleeKey: string,
  overrides: ReadonlyMap<string, EmitCall>,
): EmitCall | undefined {
  return overrides.get(calleeKey) ?? RUNTIME_CALLS.get(calleeKey);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/emitter/runtime-calls.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full typecheck and test suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/emitter/runtime-calls.ts src/emitter/runtime-calls.test.ts
git commit -m "Add resolveRuntimeCall for dialect builtin-emission overrides

Checks a dialect's builtinOverrides map before falling back to the
shared RUNTIME_CALLS table. Not wired into emit-expressions.ts yet --
next task."
```

---

### Task 5: Thread `builtinOverrides` through the emitter, end to end

**Files:**

- Modify: `src/emitter/emit-expressions.ts`
- Modify: `src/emitter/emit-statements.ts`
- Modify: `src/emitter/emit-print.ts`
- Modify: `src/emitter/emit-input.ts`
- Modify: `src/emitter/emit-read.ts`
- Modify: `src/emitter/emit-fn-defs.ts`
- Modify: `src/emitter/emit-program.ts`
- Modify: `src/index.ts`
- Test: `src/emitter/emit-expressions.test.ts` (new — see note below)

**Interfaces:**

- Consumes: `resolveRuntimeCall` (Task 4), `DialectSpec`, `getDialectSpec`, `Dialect`,
  `DEFAULT_DIALECT` (Task 1).
- Produces: `emit(lowered: LoweredProgram, dialect: Dialect = DEFAULT_DIALECT): string` (new
  second parameter, defaulted) — used by Task 5's own `src/index.ts` change and available for the
  CLI/web layer later, though neither needs to change further (both already just call `compile()`).

This is the one genuinely large task in this plan — `emitExpression` is called from 6 files across
~20 call sites, and every one of them needs the new parameter threaded through. It can't be split
into independently-committable pieces without leaving the codebase non-compiling in between (every
`emitExpression` call site's signature has to agree at once), so it's one task with many small
steps, verified once at the end. There is no known "bare `.map(emitExpression)`" risk here (the
kind that broke this exact function once before, per its own header comment) — every current call
site already wraps in an explicit arrow (`.map((e) => emitExpression(e))`) or calls it directly, so
adding a third parameter is a mechanical, low-risk change, not the same footgun class.

No `src/emitter/*.test.ts` file directly unit-tests `emitPrintCall`/`emitInputCall`/`emitReadCall`/
`emitFnDefs`/`emitStep` today (per `emit-program.test.ts`'s own header comment, this project always
tests emitted behavior via `TestRuntime`, never emitted-JS-text assertions) — so there are no
existing direct call sites of those functions in tests to update either.

- [ ] **Step 1: Write the failing test — direct `emitExpression` override test**

Create `src/emitter/emit-expressions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { emitExpression, NO_BUILTIN_OVERRIDES } from "./emit-expressions.js";
import type { Expression } from "../ast/expressions.js";

const rndCall: Expression = {
  kind: "CallExpr",
  callee: "rnd",
  args: [{ kind: "NumberLiteral", value: 1 }],
};

describe("emitExpression — builtinOverrides", () => {
  it("with no overrides, a builtin call resolves through the shared RUNTIME_CALLS table", () => {
    expect(emitExpression(rndCall, undefined, NO_BUILTIN_OVERRIDES)).toBe("rt.random()");
  });

  it("with no third argument at all, defaults to no overrides (regression pin)", () => {
    expect(emitExpression(rndCall)).toBe("rt.random()");
  });

  it("an override replaces the shared table's emission for that name", () => {
    const overrides = new Map<string, (args: readonly string[]) => string>([
      ["rnd", (a) => `__dialectRnd(${a[0]})`],
    ]);
    expect(emitExpression(rndCall, undefined, overrides)).toBe("__dialectRnd(1)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/emitter/emit-expressions.test.ts`
Expected: FAIL — `emitExpression` only accepts 2 parameters today, and `NO_BUILTIN_OVERRIDES` isn't exported.

- [ ] **Step 3: Update `emit-expressions.ts`**

Change the imports:

```typescript
import type { BinOp, Expression, UnaryOp } from "../ast/expressions.js";
import { mangleParamName, varKey } from "./mangle.js";
import { resolveRuntimeCall, type EmitCall } from "./runtime-calls.js";
import { assertNever } from "../util/assert-never.js";

const NO_LOCALS: ReadonlySet<string> = new Set();
/** Shared empty-map sentinel — every emit-*.ts file that threads `builtinOverrides` through without one of its own defaults to this, so there's exactly one "no overrides" instance, not one per file. */
export const NO_BUILTIN_OVERRIDES: ReadonlyMap<string, EmitCall> = new Map();
```

`EmitCall` currently isn't exported from `runtime-calls.ts` — export it. In `src/emitter/runtime-calls.ts`, change:

```typescript
type EmitCall = (args: readonly string[]) => string;
```

to:

```typescript
export type EmitCall = (args: readonly string[]) => string;
```

Back in `emit-expressions.ts`, update the main function's signature and every recursive call:

```typescript
export function emitExpression(
  expr: Expression,
  locals: ReadonlySet<string> = NO_LOCALS,
  builtinOverrides: ReadonlyMap<string, EmitCall> = NO_BUILTIN_OVERRIDES,
): string {
  switch (expr.kind) {
    case "NumberLiteral":
      return String(expr.value);

    case "StringLiteral":
      return JSON.stringify(expr.value);

    case "VariableRef": {
      const key = varKey(expr.name, expr.suffix);
      return locals.has(key) ? mangleParamName(key) : `V[${JSON.stringify(key)}]`;
    }

    case "UnaryExpr":
      return emitUnaryExpr(expr.op, expr.operand, locals, builtinOverrides);

    case "BinaryExpr":
      return emitBinaryExpr(expr.op, expr.left, expr.right, locals, builtinOverrides);

    case "ArrayRef": {
      const key = JSON.stringify(varKey(expr.name, expr.suffix));
      const indices = `[${expr.indices.map((i) => emitExpression(i, locals, builtinOverrides)).join(", ")}]`;
      const isString = expr.suffix === "$";
      return `__arrGet(ARR, ${key}, ${indices}, ${isString})`;
    }

    case "CallExpr": {
      const args = expr.args.map((a) => emitExpression(a, locals, builtinOverrides));
      const emitBuiltin = resolveRuntimeCall(expr.callee, builtinOverrides);
      if (emitBuiltin !== undefined) return emitBuiltin(args);
      return `FN[${JSON.stringify(expr.callee)}](${args.join(", ")})`;
    }

    default:
      return assertNever(expr, "emitExpression");
  }
}

function emitUnaryExpr(
  op: UnaryOp,
  operand: Expression,
  locals: ReadonlySet<string>,
  builtinOverrides: ReadonlyMap<string, EmitCall>,
): string {
  switch (op) {
    case "-":
      return `(-${emitExpression(operand, locals, builtinOverrides)})`;

    case "NOT":
      return `(~${emitExpression(operand, locals, builtinOverrides)})`;

    default:
      return assertNever(op, "emitUnaryExpr");
  }
}

function emitBinaryExpr(
  op: BinOp,
  left: Expression,
  right: Expression,
  locals: ReadonlySet<string>,
  builtinOverrides: ReadonlyMap<string, EmitCall>,
): string {
  const l = emitExpression(left, locals, builtinOverrides);
  const r = emitExpression(right, locals, builtinOverrides);

  switch (op) {
    case "+":
      return `(${l} + ${r})`;

    case "-":
    case "*":
      return `(${l} ${op} ${r})`;

    case "/":
      return `__div(${l}, ${r})`;

    case "\\":
      return `__intDiv(${l}, ${r})`;

    case "^":
      return `(${l} ** ${r})`;

    case "MOD":
      return `__mod(${l}, ${r})`;

    case "=":
      return `(${l} === ${r} ? -1 : 0)`;

    case "<>":
      return `(${l} !== ${r} ? -1 : 0)`;

    case "<":
    case ">":
    case "<=":
    case ">=":
      return `(${l} ${op} ${r} ? -1 : 0)`;

    case "AND":
      return `(${l} & ${r})`;

    case "OR":
      return `(${l} | ${r})`;

    default:
      return assertNever(op, "emitBinaryExpr");
  }
}
```

Every `case` body above is byte-for-byte identical to the current file — only the two
`emitExpression(left, locals)`/`emitExpression(right, locals)` calls (now precomputed once into
`l`/`r` before the `switch`, exactly as they already were) needed the new argument. The inline
comments the current file has on several of these cases (`/` and `\\`'s division-by-zero-guard
note, `AND`/`OR`'s bitwise-not-logical note, etc.) are unchanged too — omitted above only for
brevity in this plan; copy them across along with each case when editing the real file, don't
delete them.

Also update `emit-expressions.ts`'s top-of-file "CAUTION for future signature changes" paragraph
(the one explaining why adding `locals` broke bare `.map(emitExpression)` call sites) — append one
sentence to it: "The same caution now applies to `builtinOverrides` — check every
`.map(emitExpression)`/direct call site again before changing this signature a third time." Every
other doc comment in the file (on `emitExpression`, `emitUnaryExpr`, `emitBinaryExpr` themselves)
stays exactly as-is.

- [ ] **Step 4: Run typecheck to confirm the expected cascading errors**

Run: `npx tsc --noEmit`
Expected: FAIL — errors in every OTHER emitter file that calls `emitStep`/`emitPrintCall`/
`emitInputCall`/`emitReadCall`/`emitFnDefs` without threading the new parameter through yet.
Expected and fine at this point in the task — fixed by the remaining steps below.

- [ ] **Step 5: Update `emit-print.ts`**

Change the import and function signature:

```typescript
import { inferExpressionType } from "../ast/infer-type.js";
import type { Expression } from "../ast/expressions.js";
import type { PrintSegment } from "../ast/statements.js";
import { emitExpression, NO_BUILTIN_OVERRIDES } from "./emit-expressions.js";
import type { EmitCall } from "./runtime-calls.js";
import { assertNever } from "../util/assert-never.js";

export function emitPrintCall(
  segments: readonly PrintSegment[],
  fileNumber?: Expression,
  builtinOverrides: ReadonlyMap<string, EmitCall> = NO_BUILTIN_OVERRIDES,
): string {
  const lines: string[] = ['let __s = "";'];
  let suppressNewline = false;

  for (const segment of segments) {
    suppressNewline = segment.kind === "sep";

    switch (segment.kind) {
      case "sep":
        if (segment.sep === ",") {
          lines.push("__s += __tabPad(__s.length);");
        }
        break;

      case "value": {
        const valueJs = emitExpression(segment.expr, undefined, builtinOverrides);
        const formatted =
          inferExpressionType(segment.expr) === "number"
            ? `__fmtNum(${valueJs})`
            : `String(${valueJs})`;
        lines.push(`__s += ${formatted};`);
        break;
      }

      case "tab":
        lines.push(
          `__s += __tabTo(__s.length, ${emitExpression(segment.expr, undefined, builtinOverrides)});`,
        );
        break;

      case "spc":
        lines.push(`__s += __spc(${emitExpression(segment.expr, undefined, builtinOverrides)});`);
        break;

      default:
        assertNever(segment, "emitPrintCall");
    }
  }

  if (!suppressNewline) lines.push('__s += "\\n";');
  lines.push(
    fileNumber === undefined
      ? "await rt.print(__s);"
      : `await rt.writeFile(${emitExpression(fileNumber, undefined, builtinOverrides)}, __s);`,
  );
  return lines.join(" ");
}
```

(Doc comment above the function is unchanged.)

- [ ] **Step 6: Update `emit-input.ts`**

```typescript
import type { InputStep } from "../ir/program.js";
import { emitExpression, NO_BUILTIN_OVERRIDES } from "./emit-expressions.js";
import type { EmitCall } from "./runtime-calls.js";
import { varKey } from "./mangle.js";

export function emitInputCall(
  step: InputStep,
  stepIndex: number,
  builtinOverrides: ReadonlyMap<string, EmitCall> = NO_BUILTIN_OVERRIDES,
): string {
  const rawSource =
    step.fileNumber === undefined
      ? `await rt.input(${JSON.stringify(computePromptText(step.prompt, step.appendQuestionMark))})`
      : `await rt.readFileLine(${emitExpression(step.fileNumber, undefined, builtinOverrides)})`;

  const assignments = step.targets
    .map((target, index) => {
      const key = JSON.stringify(varKey(target.name, target.suffix));
      const isString = target.suffix === "$";
      const value = `__inputCoerce(__parts[${index}] ?? "", ${JSON.stringify(target.suffix)})`;
      if (target.kind === "ArrayElement") {
        const indices = `[${target.indices.map((e) => emitExpression(e, undefined, builtinOverrides)).join(", ")}]`;
        return `__arrSet(ARR, ${key}, ${indices}, ${value}, ${isString});`;
      }
      return `V[${key}] = ${value};`;
    })
    .join(" ");

  return (
    `const __raw = ${rawSource}; ` +
    `const __parts = __raw.split(","); ` +
    `${assignments} ` +
    `pc = ${stepIndex + 1}; break;`
  );
}

function computePromptText(prompt: string | undefined, appendQuestionMark: boolean): string {
  return (prompt ?? "") + (appendQuestionMark ? "? " : "");
}
```

(Doc comment above `emitInputCall` and `computePromptText` itself are unchanged.)

- [ ] **Step 7: Update `emit-read.ts`**

```typescript
import type { ReadStep } from "../ir/program.js";
import { coerceForSuffix } from "./coerce.js";
import { emitExpression, NO_BUILTIN_OVERRIDES } from "./emit-expressions.js";
import type { EmitCall } from "./runtime-calls.js";
import { varKey } from "./mangle.js";

export function emitReadCall(
  step: ReadStep,
  stepIndex: number,
  builtinOverrides: ReadonlyMap<string, EmitCall> = NO_BUILTIN_OVERRIDES,
): string {
  const assignments = step.targets
    .map((target) => {
      const key = JSON.stringify(varKey(target.name, target.suffix));
      const value = coerceForSuffix(target.suffix, "__readNext(dataPtr++)");
      if (target.kind === "ArrayElement") {
        const indices = `[${target.indices.map((e) => emitExpression(e, undefined, builtinOverrides)).join(", ")}]`;
        const isString = target.suffix === "$";
        return `__arrSet(ARR, ${key}, ${indices}, ${value}, ${isString});`;
      }
      return `V[${key}] = ${value};`;
    })
    .join(" ");

  return `${assignments} pc = ${stepIndex + 1}; break;`;
}
```

(Doc comment above unchanged.)

- [ ] **Step 8: Update `emit-fn-defs.ts`**

```typescript
import type { FnDef } from "../ir/program.js";
import { emitExpression, NO_BUILTIN_OVERRIDES } from "./emit-expressions.js";
import type { EmitCall } from "./runtime-calls.js";
import { mangleParamName, varKey } from "./mangle.js";

export function emitFnDefs(
  fnDefs: ReadonlyMap<string, FnDef>,
  builtinOverrides: ReadonlyMap<string, EmitCall> = NO_BUILTIN_OVERRIDES,
): string {
  return [...fnDefs.entries()]
    .map(([key, def]) => emitOneFnDef(key, def, builtinOverrides))
    .join("\n  ");
}

function emitOneFnDef(
  key: string,
  def: FnDef,
  builtinOverrides: ReadonlyMap<string, EmitCall>,
): string {
  const paramKeys = def.params.map((p) => varKey(p.name, p.suffix));
  const jsParams = paramKeys.map(mangleParamName).join(", ");
  const locals = new Set(paramKeys);
  const body = emitExpression(def.body, locals, builtinOverrides);
  return `FN[${JSON.stringify(key)}] = function (${jsParams}) { return ${body}; };`;
}
```

(Doc comment above unchanged.)

- [ ] **Step 9: Update `emit-statements.ts`**

Change the import:

```typescript
import type { Step } from "../ir/program.js";
import { coerceForSuffix } from "./coerce.js";
import { emitExpression, NO_BUILTIN_OVERRIDES } from "./emit-expressions.js";
import { emitPrintCall } from "./emit-print.js";
import { emitInputCall } from "./emit-input.js";
import { emitReadCall } from "./emit-read.js";
import { emitJumpTarget } from "./emit-jump-target.js";
import { varKey } from "./mangle.js";
import type { EmitCall } from "./runtime-calls.js";
import { assertNever } from "../util/assert-never.js";
```

Update `emitStep` and `emitStepBody`'s signatures, and every call site inside `emitStepBody` that
calls `emitExpression`/`emitPrintCall`/`emitInputCall`/`emitReadCall`:

```typescript
export function emitStep(
  step: Step,
  stepIndex: number,
  builtinOverrides: ReadonlyMap<string, EmitCall> = NO_BUILTIN_OVERRIDES,
): string {
  return `case ${stepIndex}: { __line = ${step.line}; ${emitStepBody(step, stepIndex, builtinOverrides)} }`;
}

function emitStepBody(
  step: Step,
  stepIndex: number,
  builtinOverrides: ReadonlyMap<string, EmitCall>,
): string {
  switch (step.kind) {
    case "Print":
      return `${emitPrintCall(step.segments, step.fileNumber, builtinOverrides)} pc = ${stepIndex + 1}; break;`;

    case "Let": {
      const key = JSON.stringify(varKey(step.target.name, step.target.suffix));
      const value = coerceForSuffix(
        step.target.suffix,
        emitExpression(step.value, undefined, builtinOverrides),
      );
      if (step.target.kind === "ArrayElement") {
        const indices = `[${step.target.indices.map((e) => emitExpression(e, undefined, builtinOverrides)).join(", ")}]`;
        const isString = step.target.suffix === "$";
        return `__arrSet(ARR, ${key}, ${indices}, ${value}, ${isString}); pc = ${stepIndex + 1}; break;`;
      }
      return `V[${key}] = ${value}; pc = ${stepIndex + 1}; break;`;
    }

    case "Goto":
      return `pc = ${emitJumpTarget(step.target)}; break;`;

    case "If":
      return `pc = (${emitExpression(step.condition, undefined, builtinOverrides)}) ? (${emitJumpTarget(step.thenTarget)}) : (${emitJumpTarget(step.elseTarget)}); break;`;

    case "For": {
      const key = JSON.stringify(varKey(step.variable, step.suffix));
      const stepExpr =
        step.step === undefined ? "1" : emitExpression(step.step, undefined, builtinOverrides);
      const bodyPc = stepIndex + 1;
      const isInt = step.suffix === "%";
      return (
        `const __start = ${emitExpression(step.start, undefined, builtinOverrides)}; ` +
        `const __limit = ${emitExpression(step.end, undefined, builtinOverrides)}; ` +
        `const __step = ${stepExpr}; ` +
        `V[${key}] = ${coerceForSuffix(step.suffix, "__start")}; ` +
        `forStack.push({ key: ${key}, limit: __limit, step: __step, bodyPc: ${bodyPc}, isInt: ${isInt} }); ` +
        `pc = ${bodyPc}; break;`
      );
    }

    case "Next": {
      const variable = step.variable === undefined ? "null" : JSON.stringify(step.variable);
      return `pc = __nextFor(V, forStack, ${variable}, ${stepIndex + 1}); break;`;
    }

    case "Gosub":
      return `gosubStack.push(${stepIndex + 1}); pc = ${emitJumpTarget(step.target)}; break;`;

    case "Return":
      return "pc = __return(gosubStack); break;";

    case "OnJump": {
      const targets = `[${step.targets.map(emitJumpTarget).join(", ")}]`;
      const fallthroughPc = stepIndex + 1;
      const selectTarget = `__onJumpTarget(${emitExpression(step.selector, undefined, builtinOverrides)}, ${targets})`;
      if (step.mode === "goto") {
        return `pc = ${selectTarget} ?? ${fallthroughPc}; break;`;
      }
      return (
        `const __target = ${selectTarget}; ` +
        `if (__target === null) { pc = ${fallthroughPc}; } ` +
        `else { gosubStack.push(${fallthroughPc}); pc = __target; } ` +
        `break;`
      );
    }

    case "Input":
      return emitInputCall(step, stepIndex, builtinOverrides);

    case "Dim": {
      const allocations = step.declarations
        .map((decl) => {
          const key = JSON.stringify(varKey(decl.name, decl.suffix));
          const dims = `[${decl.dimensions.map((e) => emitExpression(e, undefined, builtinOverrides)).join(", ")}]`;
          const isString = decl.suffix === "$";
          return `ARR[${key}] = __arrAlloc(${dims}, ${isString});`;
        })
        .join(" ");
      return `${allocations} pc = ${stepIndex + 1}; break;`;
    }

    case "Read":
      return emitReadCall(step, stepIndex, builtinOverrides);

    case "Restore": {
      const target = step.target === undefined ? "null" : String(step.target);
      return `dataPtr = __restoreTarget(${target}); pc = ${stepIndex + 1}; break;`;
    }

    case "While":
      return `pc = (${emitExpression(step.condition, undefined, builtinOverrides)}) ? ${stepIndex + 1} : (${emitJumpTarget(step.afterWend)}); break;`;

    case "Wend":
      return `pc = ${emitJumpTarget(step.whileTarget)}; break;`;

    case "Randomize":
      return `rt.seedRandom(${emitExpression(step.seed, undefined, builtinOverrides)}); pc = ${stepIndex + 1}; break;`;

    case "Open": {
      const path = emitExpression(step.path, undefined, builtinOverrides);
      const fileNumber = emitExpression(step.fileNumber, undefined, builtinOverrides);
      return `await rt.openFile(${fileNumber}, ${path}, ${JSON.stringify(step.mode)}); pc = ${stepIndex + 1}; break;`;
    }

    case "Close": {
      if (step.fileNumbers.length === 0) {
        return `await rt.closeAllFiles(); pc = ${stepIndex + 1}; break;`;
      }
      const closes = step.fileNumbers
        .map(
          (fileNumber) =>
            `await rt.closeFile(${emitExpression(fileNumber, undefined, builtinOverrides)});`,
        )
        .join(" ");
      return `${closes} pc = ${stepIndex + 1}; break;`;
    }

    case "NoOp":
      return `pc = ${stepIndex + 1}; break;`;

    case "Halt":
      return "pc = -1; break;";

    default:
      return assertNever(step, "emitStepBody");
  }
}
```

(File header comment is unchanged.)

- [ ] **Step 10: Update `emit-program.ts`**

```typescript
import type { BasicValue } from "../ast/types.js";
import type { LineIndex, LoweredProgram } from "../ir/program.js";
import { DEFAULT_DIALECT, getDialectSpec, type Dialect } from "../dialect.js";
import { emitFnDefs } from "./emit-fn-defs.js";
import { emitStep } from "./emit-statements.js";
import { PRELUDE } from "./prelude.js";

export function emit(lowered: LoweredProgram, dialect: Dialect = DEFAULT_DIALECT): string {
  const builtinOverrides = getDialectSpec(dialect).builtinOverrides;
  const linestart = emitLineTable(lowered.lineToStep);
  const dataLineStarts = emitLineTable(lowered.dataLineStarts);
  const data = emitDataArray(lowered.data);
  const fnDefs = emitFnDefs(lowered.fnDefs, builtinOverrides);
  const cases = lowered.steps
    .map((step, index) => emitStep(step, index, builtinOverrides))
    .join("\n      ");

  return `${PRELUDE}

const LINESTART = ${linestart};
const DATA = ${data};
const DATA_LINE_STARTS = ${dataLineStarts};

export async function run(rt) {
  const V = {};
  const ARR = {};
  const FN = {};
  const forStack = [];
  const gosubStack = [];
  let pc = 0;
  let __line = 0;
  let dataPtr = 0;
  ${fnDefs}
  try {
    while (pc !== -1) {
      switch (pc) {
      ${cases}
        default:
          pc = -1;
      }
    }
  } catch (e) {
    await rt.reportError(__toBasicError(e, __line));
  }
}
`;
}

function emitLineTable(table: LineIndex): string {
  const entries = [...table.entries()].map(([line, value]) => `${line}: ${value}`);
  return `{ ${entries.join(", ")} }`;
}

function emitDataArray(data: readonly BasicValue[]): string {
  const items = data.map((value) =>
    typeof value === "string" ? JSON.stringify(value) : String(value),
  );
  return `[${items.join(", ")}]`;
}
```

(File header comment is unchanged.)

- [ ] **Step 11: Update `src/index.ts`'s `compile()`**

Find:

```typescript
export function compile(source: string, dialect: Dialect = DEFAULT_DIALECT): CompileResult {
  const tokens = tokenize(source);
  const ast = parse(tokens, dialect);
  const diagnostics = analyze(ast);
  if (diagnostics.length > 0) throw new SemanticError(diagnostics);
  const lowered = lower(ast);
  const js = emit(lowered);
  return { js, ast, lowered };
}
```

Replace with:

```typescript
export function compile(source: string, dialect: Dialect = DEFAULT_DIALECT): CompileResult {
  const tokens = tokenize(source, dialect);
  const ast = parse(tokens, dialect);
  const diagnostics = analyze(ast);
  if (diagnostics.length > 0) throw new SemanticError(diagnostics);
  const lowered = lower(ast);
  const js = emit(lowered, dialect);
  return { js, ast, lowered };
}
```

Also update the file's header comment — find:

```typescript
// `dialect` (see src/dialect.ts) only ever needs to reach `parse()` — see
// that module's own doc comment for why nothing downstream needs it too.
```

Replace with:

```typescript
// `dialect` (see src/dialect.ts) now reaches tokenize(), parse(), and
// emit() — see src/dialect.ts's own doc comment for exactly what each
// stage uses it for. analyze() and lower() stay dialect-agnostic.
```

- [ ] **Step 12: Run the new emit-expressions test**

Run: `npx vitest run src/emitter/emit-expressions.test.ts`
Expected: PASS.

- [ ] **Step 13: Run full typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — every call site across all 7 modified files now agrees on the new signatures.

- [ ] **Step 14: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all existing tests (423+ from before this task, plus this task's own new tests),
confirming zero observable behavior change end to end, including the full golden-program suite and
CLI integration tests exercising real `--dialect gwbasic` runs.

- [ ] **Step 15: Manually verify end-to-end with a real program**

Run:

```bash
npx tsx src/cli/index.ts run tests/golden/programs/fizzbuzz/program.bas
```

Expected: identical FizzBuzz output to before this task (confirms the fully-threaded
`builtinOverrides` chain, which is empty for `classic`, produces byte-identical output).

- [ ] **Step 16: Commit**

```bash
git add src/emitter/ src/index.ts
git commit -m "Thread builtinOverrides through the emitter end to end

emitExpression gains a third builtinOverrides parameter (mirroring the
existing locals parameter's pattern) and resolves CallExpr emission
via runtime-calls.ts's resolveRuntimeCall instead of a bare
RUNTIME_CALLS.get(). Every caller across emit-statements.ts,
emit-print.ts, emit-input.ts, emit-read.ts, and emit-fn-defs.ts
threads it through; emit-program.ts's emit(lowered, dialect?) resolves
the active dialect's builtinOverrides once and passes it down;
compile() (src/index.ts) now passes dialect to emit() too, not just
parse(). No bare .map(emitExpression) call sites existed to trip the
known footgun (see emit-expressions.ts's own CAUTION comment) --
verified by grep before starting. Zero observable behavior change for
classic/gwbasic (both have empty builtinOverrides) -- full existing
suite plus new resolveRuntimeCall/emitExpression override tests all
green."
```

---

### Task 6: Docs and final verification

**Files:**

- Modify: `DIALECT.md`
- Modify: `CLAUDE.md`

**Interfaces:** None — this task only touches documentation, no code.

- [ ] **Step 1: Add DIALECT.md's "Adding a dialect" recipe**

In `DIALECT.md`, find the `## Open Decisions / Locked Defaults` heading and insert a new section
immediately before it:

```markdown
## Adding a dialect

The GW-BASIC dialect extension (above) and its later generalization into a data-driven
`DialectSpec` model (`src/dialect.ts`) leave a concrete recipe for a real third dialect (Applesoft,
Commodore BASIC V2, ...):

1. Write the new dialect's `DialectSpec` in `src/dialect.ts` — fill in whichever of
   `extraKeywords`/`droppedKeywords`/`unsupportedKeywords`/`extraBuiltins`/`identifierRule`/
   `disallowedSuffixes`/`builtinOverrides` it actually needs; leave the rest at their empty/`"full"`
   defaults, matching `CLASSIC_SPEC`/`GWBASIC_SPEC`.
2. Add the new dialect's literal to the `Dialect` union and register its spec in `DIALECT_SPECS`.
3. For each `extraKeywords` entry that's a genuinely new lexer keyword (not a gated _form_ of an
   existing one, like `gwbasic`'s `"PRINT #"`), add it to `src/lexer/keywords.ts`'s `KEYWORDS` set
   — the lexer always recognizes the union of every dialect's vocabulary, gating happens in the
   parser.
4. Add the AST/`Step`/emission support the new construct needs, per CLAUDE.md's "How to add a new
   BASIC statement"/"How to add a new builtin function" recipes — call `requireDialectKeyword`
   (`src/parser/parse-statements.ts`) at the parse function's entry point for an `extraKeywords`
   entry, or wire a real `checkBaselineKeywordAvailability` call at the relevant baseline
   construct's dispatch point in `parseStatement` for a `droppedKeywords` entry (no existing call
   site does this yet — Commodore BASIC V2 dropping `WHILE`/`WEND` would be the first).
5. For a hardware/platform-only construct with no JS equivalent (`PEEK`/`POKE`/graphics commands),
   add it to `unsupportedKeywords` with a clear reason string instead of building any AST/emission
   support for it at all — see this project's "clear rejection over silent misinterpretation"
   posture (Open Decisions, below).
6. Add CLI (`--dialect <name>`, `src/cli/index.ts`'s `parseDialectOption`) and web UI
   (`web/src/components/DialectSelector`) support for the new literal.
7. Document every syntax/semantics delta in this file, in its own `## <Dialect> dialect extension`
   section (following the GW-BASIC section's structure above).
8. Add golden fixtures (`tests/golden/programs/`, mirrored into `web/src/examples/` — see
   CONTRIBUTING.md) exercising the new dialect's real behavior.
```

- [ ] **Step 2: Correct CLAUDE.md's `src/dialect.ts` description**

In `CLAUDE.md`, find the sentence (in the "What this project is" section):

```markdown
Two BASIC dialects are supported (`src/dialect.ts`): the
default `"classic"` spec, and `"gwbasic"`, which adds GW-BASIC's sequential file I/O
(`OPEN`/`CLOSE`/`PRINT #`/`INPUT #`/`EOF()`) — see DIALECT.md's "GW-BASIC dialect extension"
section and this file's "Progress" notes for how dialect selection threads through the pipeline.
```

Replace with:

```markdown
Two BASIC dialects are supported (`src/dialect.ts`): the
default `"classic"` spec, and `"gwbasic"`, which adds GW-BASIC's sequential file I/O
(`OPEN`/`CLOSE`/`PRINT #`/`INPUT #`/`EOF()`). Dialect selection is expressed as a data-driven
`DialectSpec` per dialect (also `src/dialect.ts`), consulted by the lexer (identifier
normalization), parser (keyword/builtin gating), and emitter (builtin-emission overrides) — see
DIALECT.md's "Adding a dialect" recipe and this file's "Progress" notes below for exactly how.
```

- [ ] **Step 3: Add a Progress entry**

At the end of `CLAUDE.md`'s existing GW-BASIC dialect extension Progress entry (the one ending
"...the CLI (`--dialect` against the real filesystem, both the dialect-gating and unrecognized-value
error paths)."), append a new paragraph:

```markdown
- **Multi-dialect capability model (follow-on generalization)** — replaced the single-flag
  `requireGwBasic` check with a data-driven `DialectSpec` per dialect (`src/dialect.ts`), so a
  future dialect can express not just additive syntax but also removing a baseline construct
  (`droppedKeywords`), rejecting a construct with no JS equivalent (`unsupportedKeywords`),
  changing identifier normalization (`identifierRule`), disallowing a type suffix
  (`disallowedSuffixes`), and overriding a shared builtin's JS emission (`builtinOverrides`) — none
  of which the original additive-only model could express (real gaps found by looking at what
  Applesoft BASIC and Commodore BASIC V2 actually need, see
  `docs/superpowers/specs/2026-08-11-multi-dialect-capability-model-design.md`). `dialect` now
  reaches three pipeline stages instead of one: the lexer (identifier normalization), the parser
  (generalized from `requireGwBasic`), and the emitter (builtin-emission overrides, threaded
  through `emitExpression`'s new third parameter the same way `locals` already threads through it).
  `classic`/`gwbasic` were refactored onto the new model losslessly — every axis beyond what
  `gwbasic` already needed (`droppedKeywords`/`unsupportedKeywords`/`identifierRule` truncation/
  `disallowedSuffixes`/`builtinOverrides`) stays empty/`"full"` for both, proven inert by the full
  existing suite passing unchanged, with the new axes themselves covered by direct unit tests
  against synthetic (test-only, not registered in the real `Dialect` union) `DialectSpec` objects.
  No third dialect was added — Applesoft/Commodore BASIC V2 remain documented, deliberately
  deferred follow-on work (see DIALECT.md's new "Adding a dialect" recipe for the concrete path).
```

- [ ] **Step 4: Run final full verification**

Run:

```bash
npx tsc --noEmit
npx vitest run
npm run lint
npm run format:check
npm run build
npm run web:build
```

Expected: all clean/passing. `npm run web:build` in particular confirms nothing in `web/`
regressed even though this plan never touches `web/` — it imports `@core/dialect.js`'s `Dialect`
type, which is unchanged.

- [ ] **Step 5: Commit**

```bash
git add DIALECT.md CLAUDE.md
git commit -m "Document the multi-dialect capability model

DIALECT.md gains an 'Adding a dialect' recipe (mirrors CLAUDE.md's
existing 'How to add a new BASIC statement' recipe). CLAUDE.md's
src/dialect.ts description and Progress notes corrected to describe
the real three-stage (lexer/parser/emitter) threading, replacing the
GW-BASIC-era 'dialect only reaches the parser' claim.

Full verification: typecheck, full test suite, lint, format, both
production builds all clean. Closes out the multi-dialect capability
model design spec (docs/superpowers/specs/2026-08-11-multi-dialect-capability-model-design.md)
-- classic/gwbasic refactored onto DialectSpec losslessly, zero
observable behavior change, Applesoft/Commodore BASIC V2 left as
documented follow-on work."
```

---

## Self-Review Notes

**Spec coverage:** every design-doc section maps to a task —

- Architecture's 3-stage threading table → Tasks 2 (parser), 3 (lexer), 5 (emitter).
- The 6 `DialectSpec` fields → Task 1.
- The 3 error-message shapes → Task 1's `checkExtraKeywordAvailability`/
  `checkBaselineKeywordAvailability` (wrong-dialect and dropped-from-dialect) and the
  `unsupportedKeywords` check inside both (no-JS-equivalent) — all three exist and are tested,
  even though only the first is wired into a real (gwbasic) call site.
- Migration plan (classic/gwbasic refactored losslessly) → every task's regression-suite step.
- Testing section's four synthetic-dialect scenarios (dropped keyword, unsupported keyword,
  identifier truncation, builtin override) → Task 1's tests (dropped/unsupported/truncation) and
  Task 5's `emit-expressions.test.ts` (builtin override).
- Docs → Task 6.

**Placeholder scan:** no "TBD"/"TODO"/"implement later" strings anywhere in this plan; every step
shows complete code, not a description of code.

**Type consistency:** `DialectSpec`, `IdentifierRule`, `KeywordAvailability`, `Dialect`,
`DEFAULT_DIALECT`, `getDialectSpec`, `checkExtraKeywordAvailability`,
`checkBaselineKeywordAvailability`, `isBuiltinAvailable`, `normalizeIdentifierName`,
`isSuffixAllowed`, `resolveRuntimeCall`, `EmitCall`, `NO_BUILTIN_OVERRIDES` are each defined exactly
once (Task 1 or Task 4/5) and referenced with the same name/signature everywhere they're used in
later tasks.
