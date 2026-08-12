import { describe, expect, it } from "vitest";
import { BUILTIN_FUNCTIONS } from "../parser/builtins.js";
import { builtinKeysMatch, RUNTIME_CALLS } from "./runtime-calls.js";

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
