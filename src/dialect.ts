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
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

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
