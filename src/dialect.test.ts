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
      unsupportedKeywords: new Map([["PEEK", "PEEK is not supported by basic2js: no meaningful JavaScript equivalent for direct memory access"]]),
      extraBuiltins: new Set(),
      identifierRule: "full",
      disallowedSuffixes: new Set(),
      builtinOverrides: new Map(),
    };
    expect(checkExtraKeywordAvailability(synthetic, "PEEK")).toEqual({
      ok: false,
      message: "PEEK is not supported by basic2js: no meaningful JavaScript equivalent for direct memory access",
    });
  });
});

describe("checkBaselineKeywordAvailability", () => {
  it("allows a baseline keyword by default", () => {
    expect(checkBaselineKeywordAvailability(getDialectSpec("classic"), "WHILE")).toEqual({ ok: true });
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
