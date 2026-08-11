import { describe, expect, it } from "vitest";
import { tokenize } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { lower } from "./lowering.js";
import { lowerStatement } from "./lower-statements.js";
import type { LoweredProgram } from "./program.js";
import type { IfStmt } from "../ast/statements.js";

function lowerSource(source: string): LoweredProgram {
  return lower(parse(tokenize(source)));
}

describe("lower — statement kinds", () => {
  it("lowers PRINT 1:1 into a Print step", () => {
    const { steps } = lowerSource('10 PRINT "HI"');
    expect(steps).toEqual([
      { kind: "Print", line: 10, segments: [{ kind: "value", expr: { kind: "StringLiteral", value: "HI" } }] },
    ]);
  });

  it("lowers LET 1:1 into a Let step", () => {
    const { steps } = lowerSource("10 LET A = 5");
    expect(steps).toEqual([
      {
        kind: "Let",
        line: 10,
        target: { kind: "Variable", name: "a", suffix: "" },
        value: { kind: "NumberLiteral", value: 5 },
      },
    ]);
  });

  it("lowers GOTO into a Goto step carrying the raw, unresolved target line number", () => {
    const { steps } = lowerSource("10 GOTO 40");
    expect(steps).toEqual([{ kind: "Goto", line: 10, target: 40 }]);
  });

  it("lowers REM into a NoOp step", () => {
    const { steps } = lowerSource("10 REM a comment");
    expect(steps).toEqual([{ kind: "NoOp", line: 10 }]);
  });

  it("lowers END and STOP into Halt steps", () => {
    expect(lowerSource("10 END").steps).toEqual([{ kind: "Halt", line: 10 }]);
    expect(lowerSource("10 STOP").steps).toEqual([{ kind: "Halt", line: 10 }]);
  });

  it("throws a clear internal error when asked to lower an unsupported statement kind", () => {
    // Bypasses the parser (which never produces IfStmt yet) to exercise
    // lower-statements.ts's defensive backstop directly.
    const fakeIfStmt: IfStmt = {
      kind: "IfStmt",
      condition: { kind: "NumberLiteral", value: 1 },
      thenBranch: { kind: "GotoLine", lineNumber: 20 },
    };
    expect(() => lowerStatement(fakeIfStmt, 10)).toThrow(/not implemented yet/);
  });
});

describe("lower — Step[] flattening and line numbering", () => {
  it("gives every colon-separated statement on a line its own step, all tagged with that line number", () => {
    const { steps } = lowerSource("10 A = 1: B = 2: PRINT A");
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.line)).toEqual([10, 10, 10]);
    expect(steps.map((s) => s.kind)).toEqual(["Let", "Let", "Print"]);
  });

  it("flattens statements across multiple lines into one contiguous Step[]", () => {
    const { steps } = lowerSource("10 LET I = 1\n20 PRINT I\n30 LET I = I + 1\n40 GOTO 20");
    expect(steps.map((s) => [s.kind, s.line])).toEqual([
      ["Let", 10],
      ["Print", 20],
      ["Let", 30],
      ["Goto", 40],
    ]);
  });
});

describe("lower — lineToStep index", () => {
  it("maps each line number to the index of its first step", () => {
    const { steps, lineToStep } = lowerSource("10 LET I = 1\n20 PRINT I\n30 LET I = I + 1\n40 GOTO 20");
    expect(lineToStep.get(10)).toBe(0);
    expect(lineToStep.get(20)).toBe(1);
    expect(lineToStep.get(30)).toBe(2);
    expect(lineToStep.get(40)).toBe(3);
    expect(steps).toHaveLength(4);
  });

  it("points a line with multiple statements at its first statement's step", () => {
    const { lineToStep } = lowerSource("10 PRINT 1\n20 A = 1: B = 2: PRINT A\n30 PRINT 2");
    expect(lineToStep.get(20)).toBe(1); // steps: [Print(10), Let(20), Let(20), Print(20), Print(30)]
    expect(lineToStep.get(30)).toBe(4);
  });

  it("aliases an empty line (line number only, no statements) to whatever step comes next", () => {
    const { steps, lineToStep } = lowerSource("10 PRINT 1\n50\n60 PRINT 2");
    expect(steps).toHaveLength(2);
    expect(lineToStep.get(50)).toBe(lineToStep.get(60));
    expect(lineToStep.get(50)).toBe(1);
  });

  it("aliases a trailing empty line to one-past-the-end of Step[] (the emitted halt case)", () => {
    const { steps, lineToStep } = lowerSource("10 PRINT 1\n999");
    expect(lineToStep.get(999)).toBe(steps.length);
  });

  it("does not resolve GOTO targets to step indices — that's left to the emitter (step 4)", () => {
    const { steps, lineToStep } = lowerSource("10 GOTO 30\n20 PRINT 1\n30 PRINT 2");
    const gotoStep = steps[0];
    expect(gotoStep).toEqual({ kind: "Goto", line: 10, target: 30 });
    // The information needed to resolve it is available in lineToStep, though.
    expect(lineToStep.get(30)).toBe(steps.findIndex((s) => s.kind === "Print" && s.line === 30));
  });
});
