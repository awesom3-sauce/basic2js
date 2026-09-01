import { describe, expect, it } from "vitest";
import { emitExpression, NO_BUILTIN_OVERRIDES } from "./emit-expressions.js";
import type { Expression } from "../ast/expressions.js";
import type { EmitCall } from "./runtime-calls.js";

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
    const overrides = new Map<string, EmitCall>([["rnd", (a) => `__dialectRnd(${a[0]})`]]);
    expect(emitExpression(rndCall, undefined, overrides)).toBe("__dialectRnd(1)");
  });
});
