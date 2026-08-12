import { describe, expect, it } from "vitest";
import { inferExpressionType } from "./infer-type.js";
import type { Expression } from "./expressions.js";

const num = (value: number): Expression => ({ kind: "NumberLiteral", value });
const str = (value: string): Expression => ({ kind: "StringLiteral", value });

describe("inferExpressionType", () => {
  it("infers literals directly", () => {
    expect(inferExpressionType(num(5))).toBe("number");
    expect(inferExpressionType(str("hi"))).toBe("string");
  });

  it("infers VariableRef/ArrayRef from their suffix", () => {
    expect(inferExpressionType({ kind: "VariableRef", name: "a", suffix: "" })).toBe("number");
    expect(inferExpressionType({ kind: "VariableRef", name: "a", suffix: "$" })).toBe("string");
    expect(
      inferExpressionType({ kind: "ArrayRef", name: "a", suffix: "$", indices: [num(1)] }),
    ).toBe("string");
  });

  it("infers unary expressions as always numeric", () => {
    expect(inferExpressionType({ kind: "UnaryExpr", op: "-", operand: num(1) })).toBe("number");
    expect(inferExpressionType({ kind: "UnaryExpr", op: "NOT", operand: num(1) })).toBe("number");
  });

  it("infers + as string when either operand is a string, else numeric", () => {
    expect(inferExpressionType({ kind: "BinaryExpr", op: "+", left: num(1), right: num(2) })).toBe(
      "number",
    );
    expect(
      inferExpressionType({ kind: "BinaryExpr", op: "+", left: str("a"), right: str("b") }),
    ).toBe("string");
    expect(
      inferExpressionType({ kind: "BinaryExpr", op: "+", left: str("a"), right: num(1) }),
    ).toBe("string");
  });

  it("infers every non-+ BinOp as numeric, regardless of operand types", () => {
    expect(
      inferExpressionType({ kind: "BinaryExpr", op: "=", left: str("a"), right: str("b") }),
    ).toBe("number");
    expect(inferExpressionType({ kind: "BinaryExpr", op: "*", left: num(1), right: num(2) })).toBe(
      "number",
    );
  });

  it("infers CallExpr from the callee's own $-suffixed spelling", () => {
    expect(inferExpressionType({ kind: "CallExpr", callee: "left$", args: [] })).toBe("string");
    expect(inferExpressionType({ kind: "CallExpr", callee: "len", args: [] })).toBe("number");
  });
});
