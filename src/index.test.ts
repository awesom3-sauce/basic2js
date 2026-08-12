import { describe, expect, it } from "vitest";
import { compile } from "./index.js";
import { SemanticError } from "./semantics/semantic-error.js";

describe("compile()", () => {
  it("returns js/ast/lowered for a valid program", () => {
    const result = compile('10 PRINT "HI"');
    expect(result.js).toContain("export async function run(rt)");
    expect(result.ast.kind).toBe("Program");
    expect(result.lowered.steps.length).toBeGreaterThan(0);
  });

  it("throws a SemanticError for a compile-time type mismatch instead of emitting code", () => {
    expect(() => compile("10 A$ = 5")).toThrow(SemanticError);
  });

  it("the thrown SemanticError carries the underlying diagnostics", () => {
    try {
      compile("10 A$ = 5");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SemanticError);
      const error = e as SemanticError;
      expect(error.diagnostics).toHaveLength(1);
      expect(error.diagnostics[0]?.code).toBe("TYPE_MISMATCH");
    }
  });

  it("still throws ParseError (not SemanticError) for a syntax error", async () => {
    const { ParseError } = await import("./parser/errors.js");
    expect(() => compile("10 PRINT 1 2")).toThrow(ParseError);
  });
});
