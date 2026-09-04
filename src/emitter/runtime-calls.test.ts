import { describe, expect, it } from "vitest";
import { BUILTIN_FUNCTIONS } from "../parser/builtins.js";
import { builtinKeysMatch, resolveRuntimeCall, RUNTIME_CALLS } from "./runtime-calls.js";
import type { EmitCall } from "./runtime-calls.js";

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
    const overrides = new Map<string, EmitCall>([["rnd", () => "__dialectSpecificRnd()"]]);
    const result = resolveRuntimeCall("rnd", overrides);
    expect(result).toBeDefined();
    expect(result!([])).toBe("__dialectSpecificRnd()");
  });

  it("an override for a name with no shared-table entry at all still resolves", () => {
    const overrides = new Map<string, EmitCall>([["peek", (a) => `__peek(${a[0]})`]]);
    const result = resolveRuntimeCall("peek", overrides);
    expect(result).toBeDefined();
    expect(result!(["1"])).toBe("__peek(1)");
  });
});
