import { describe, expect, it } from "vitest";
import { BUILTIN_FUNCTIONS } from "../parser/builtins.js";
import { builtinKeysMatch, builtinReturnsString, RUNTIME_CALLS } from "./runtime-calls.js";

describe("runtime-calls / builtins key-set consistency", () => {
  it("RUNTIME_CALLS has exactly the same keys as BUILTIN_FUNCTIONS", () => {
    expect(builtinKeysMatch()).toBe(true);
  });

  it("every BUILTIN_FUNCTIONS key has a RUNTIME_CALLS entry", () => {
    for (const key of BUILTIN_FUNCTIONS.keys()) {
      expect(RUNTIME_CALLS.has(key)).toBe(true);
    }
  });

  it("every RUNTIME_CALLS key has a BUILTIN_FUNCTIONS entry", () => {
    for (const key of RUNTIME_CALLS.keys()) {
      expect(BUILTIN_FUNCTIONS.has(key)).toBe(true);
    }
  });
});

describe("builtinReturnsString", () => {
  it("is true for $-suffixed builtin names", () => {
    expect(builtinReturnsString("left$")).toBe(true);
    expect(builtinReturnsString("str$")).toBe(true);
  });

  it("is false for non-$-suffixed builtin names", () => {
    expect(builtinReturnsString("len")).toBe(false);
    expect(builtinReturnsString("int")).toBe(false);
    expect(builtinReturnsString("rnd")).toBe(false);
  });
});
