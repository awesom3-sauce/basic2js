import { describe, expect, it } from "vitest";
import { tokenize } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { lower } from "./lowering.js";
import type { LoweredProgram } from "./program.js";
import type { Dialect } from "../dialect.js";

function lowerSource(source: string, dialect?: Dialect): LoweredProgram {
  return lower(parse(tokenize(source), dialect));
}

describe("lower — statement kinds", () => {
  it("lowers PRINT 1:1 into a Print step", () => {
    const { steps } = lowerSource('10 PRINT "HI"');
    expect(steps).toEqual([
      {
        kind: "Print",
        line: 10,
        segments: [{ kind: "value", expr: { kind: "StringLiteral", value: "HI" } }],
      },
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
    expect(steps).toEqual([{ kind: "Goto", line: 10, target: { kind: "line", line: 40 } }]);
  });

  it("lowers REM into a NoOp step", () => {
    const { steps } = lowerSource("10 REM a comment");
    expect(steps).toEqual([{ kind: "NoOp", line: 10 }]);
  });

  it("lowers END and STOP into Halt steps", () => {
    expect(lowerSource("10 END").steps).toEqual([{ kind: "Halt", line: 10 }]);
    expect(lowerSource("10 STOP").steps).toEqual([{ kind: "Halt", line: 10 }]);
  });

  // All 20 Statement kinds are implemented as of build order step 13 (DEF
  // FN was the last one) — there's no longer an unsupported kind left to
  // exercise lowerStatement's defensive `assertNever` backstop with.
});

describe("lower — GOSUB/RETURN/ON", () => {
  it("lowers GOSUB into a Gosub step carrying the raw, unresolved target line number", () => {
    const { steps } = lowerSource("10 GOSUB 100");
    expect(steps).toEqual([{ kind: "Gosub", line: 10, target: { kind: "line", line: 100 } }]);
  });

  it("lowers RETURN into a Return step", () => {
    const { steps } = lowerSource("10 RETURN");
    expect(steps).toEqual([{ kind: "Return", line: 10 }]);
  });

  it("lowers ON...GOTO into a single OnJump step with resolved-later line targets", () => {
    const { steps } = lowerSource("10 ON N GOTO 100, 200, 300");
    expect(steps).toEqual([
      {
        kind: "OnJump",
        line: 10,
        mode: "goto",
        selector: { kind: "VariableRef", name: "n", suffix: "" },
        targets: [
          { kind: "line", line: 100 },
          { kind: "line", line: 200 },
          { kind: "line", line: 300 },
        ],
      },
    ]);
  });

  it("lowers ON...GOSUB with mode preserved", () => {
    const { steps } = lowerSource("10 ON N GOSUB 100, 200");
    const step = steps[0]!;
    if (step.kind !== "OnJump") throw new Error("expected OnJump step");
    expect(step.mode).toBe("gosub");
  });
});

describe("lower — FOR/NEXT", () => {
  it("lowers FOR 1:1 into a For step, defaulting an omitted STEP to undefined", () => {
    const { steps } = lowerSource("10 FOR I = 1 TO 10");
    expect(steps).toEqual([
      {
        kind: "For",
        line: 10,
        variable: "i",
        suffix: "",
        start: { kind: "NumberLiteral", value: 1 },
        end: { kind: "NumberLiteral", value: 10 },
        step: undefined,
      },
    ]);
  });

  it("carries an explicit STEP expression through", () => {
    const { steps } = lowerSource("10 FOR I = 10 TO 1 STEP -1");
    const forStep = steps[0]!;
    if (forStep.kind !== "For") throw new Error("expected For step");
    expect(forStep.step).toEqual({
      kind: "UnaryExpr",
      op: "-",
      operand: { kind: "NumberLiteral", value: 1 },
    });
  });

  it("lowers a bare NEXT into a single Next step with variable undefined", () => {
    const { steps } = lowerSource("10 NEXT");
    expect(steps).toEqual([{ kind: "Next", line: 10, variable: undefined }]);
  });

  it("lowers NEXT with one variable into a single Next step naming it", () => {
    const { steps } = lowerSource("10 NEXT I");
    expect(steps).toEqual([{ kind: "Next", line: 10, variable: "i" }]);
  });

  it("lowers NEXT with multiple variables into separate sequential Next steps", () => {
    const { steps } = lowerSource("10 NEXT I, J");
    expect(steps).toEqual([
      { kind: "Next", line: 10, variable: "i" },
      { kind: "Next", line: 10, variable: "j" },
    ]);
  });
});

describe("lower — IF/THEN/ELSE", () => {
  it("lowers a bare IF/THEN <line> with no ELSE into a single If step", () => {
    const { steps } = lowerSource("10 IF X = 1 THEN 30\n20 PRINT 1\n30 PRINT 2");
    expect(steps[0]).toEqual({
      kind: "If",
      line: 10,
      condition: {
        kind: "BinaryExpr",
        op: "=",
        left: { kind: "VariableRef", name: "x", suffix: "" },
        right: { kind: "NumberLiteral", value: 1 },
      },
      thenTarget: { kind: "line", line: 30 },
      elseTarget: { kind: "line", line: 20 }, // falls through to the next source line
    });
    expect(steps).toHaveLength(3); // If(10), Print(20), Print(30)
  });

  it("lowers IF/THEN <line> ELSE <line> with no extra steps", () => {
    const { steps } = lowerSource("10 IF X THEN 30 ELSE 40\n20 END");
    expect(steps).toEqual([
      {
        kind: "If",
        line: 10,
        condition: { kind: "VariableRef", name: "x", suffix: "" },
        thenTarget: { kind: "line", line: 30 },
        elseTarget: { kind: "line", line: 40 },
      },
      { kind: "Halt", line: 20 },
    ]);
  });

  it("lowers an inline THEN statement list into steps immediately following the If step", () => {
    const { steps } = lowerSource('10 IF X THEN PRINT "A": PRINT "B"\n20 PRINT "NEXT LINE"');
    expect(steps.map((s) => s.kind)).toEqual(["If", "Print", "Print", "Print"]);
    const ifStep = steps[0]!;
    if (ifStep.kind !== "If") throw new Error("expected If step");
    expect(ifStep.thenTarget).toEqual({ kind: "step", index: 1 });
    // No ELSE branch: falling off THEN's steps should reach the next
    // source line, and (since there's no ELSE with its own steps to skip
    // over) elseTarget goes straight there too, with no extra skip-jump.
    expect(ifStep.elseTarget).toEqual({ kind: "line", line: 20 });
  });

  it("inserts a skip-jump after an inline THEN so it can't fall through into an inline ELSE", () => {
    const { steps } = lowerSource('10 IF X THEN PRINT "A" ELSE PRINT "B"\n20 PRINT "NEXT"');
    // If(0), Print("A")(1), Goto-skip(2), Print("B")(3), Print("NEXT")(4)
    expect(steps.map((s) => s.kind)).toEqual(["If", "Print", "Goto", "Print", "Print"]);
    const ifStep = steps[0]!;
    const skipStep = steps[2]!;
    if (ifStep.kind !== "If" || skipStep.kind !== "Goto") throw new Error("unexpected step kinds");
    expect(ifStep.thenTarget).toEqual({ kind: "step", index: 1 });
    expect(ifStep.elseTarget).toEqual({ kind: "step", index: 3 });
    expect(skipStep.target).toEqual({ kind: "line", line: 20 }); // skips over the ELSE steps
  });

  it("uses a halt target when an IF's branch falls off the end of the last line", () => {
    const { steps } = lowerSource('10 IF X THEN PRINT "A"');
    const ifStep = steps[0]!;
    if (ifStep.kind !== "If") throw new Error("expected If step");
    expect(ifStep.elseTarget).toEqual({ kind: "halt" });
  });

  it("supports a nested IF inside a THEN branch", () => {
    const { steps } = lowerSource("10 IF X THEN IF Y THEN 30\n20 END\n30 END");
    expect(steps.map((s) => s.kind)).toEqual(["If", "If", "Halt", "Halt"]);
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
    const { steps, lineToStep } = lowerSource(
      "10 LET I = 1\n20 PRINT I\n30 LET I = I + 1\n40 GOTO 20",
    );
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
    expect(gotoStep).toEqual({ kind: "Goto", line: 10, target: { kind: "line", line: 30 } });
    // The information needed to resolve it is available in lineToStep, though.
    expect(lineToStep.get(30)).toBe(steps.findIndex((s) => s.kind === "Print" && s.line === 30));
  });
});

describe("lower — INPUT", () => {
  it("lowers INPUT 1:1 into an Input step", () => {
    const { steps } = lowerSource("10 INPUT X");
    expect(steps).toEqual([
      {
        kind: "Input",
        line: 10,
        prompt: undefined,
        appendQuestionMark: true,
        targets: [{ kind: "Variable", name: "x", suffix: "" }],
      },
    ]);
  });

  it("carries a custom prompt and appendQuestionMark through", () => {
    const { steps } = lowerSource('10 INPUT "Name", N$');
    expect(steps).toEqual([
      {
        kind: "Input",
        line: 10,
        prompt: "Name",
        appendQuestionMark: false,
        targets: [{ kind: "Variable", name: "n", suffix: "$" }],
      },
    ]);
  });
});

describe("lower — DIM / arrays", () => {
  it("lowers DIM 1:1 into a Dim step", () => {
    const { steps } = lowerSource("10 DIM A(10)");
    expect(steps).toEqual([
      {
        kind: "Dim",
        line: 10,
        declarations: [
          { name: "a", suffix: "", dimensions: [{ kind: "NumberLiteral", value: 10 }] },
        ],
      },
    ]);
  });

  it("lowers an array-element LET target through unchanged", () => {
    const { steps } = lowerSource("10 A(1) = 5");
    expect(steps).toEqual([
      {
        kind: "Let",
        line: 10,
        target: {
          kind: "ArrayElement",
          name: "a",
          suffix: "",
          indices: [{ kind: "NumberLiteral", value: 1 }],
        },
        value: { kind: "NumberLiteral", value: 5 },
      },
    ]);
  });
});

describe("lower — DATA/READ/RESTORE", () => {
  it("produces no Step for DATA, but collects its values into the flat pool", () => {
    const { steps, data } = lowerSource("10 DATA 1, 2, 3");
    expect(steps).toEqual([]);
    expect(data).toEqual([1, 2, 3]);
  });

  it("collects DATA from multiple lines into one pool, in source order", () => {
    const { data } = lowerSource('10 DATA 1\n20 PRINT "x"\n30 DATA 2, 3');
    expect(data).toEqual([1, 2, 3]);
  });

  it("records dataLineStarts for each line that has its own DATA", () => {
    const { data, dataLineStarts } = lowerSource("10 DATA 1, 2\n20 DATA 3, 4");
    expect(dataLineStarts.get(10)).toBe(0);
    expect(dataLineStarts.get(20)).toBe(2);
    expect(data).toEqual([1, 2, 3, 4]);
  });

  it("lowers READ 1:1 into a Read step", () => {
    const { steps } = lowerSource("10 READ A, B$");
    expect(steps).toEqual([
      {
        kind: "Read",
        line: 10,
        targets: [
          { kind: "Variable", name: "a", suffix: "" },
          { kind: "Variable", name: "b", suffix: "$" },
        ],
      },
    ]);
  });

  it("lowers RESTORE 1:1 into a Restore step", () => {
    expect(lowerSource("10 RESTORE").steps).toEqual([
      { kind: "Restore", line: 10, target: undefined },
    ]);
    expect(lowerSource("10 RESTORE 100").steps).toEqual([
      { kind: "Restore", line: 10, target: 100 },
    ]);
  });
});

describe("lower — WHILE/WEND", () => {
  it("resolves a simple WHILE/WEND pair to matching step-index targets", () => {
    const { steps } = lowerSource("10 WHILE X < 10\n20 PRINT X\n30 WEND\n40 PRINT 1");
    // While(0), Print(1), Wend(2), Print(3)
    expect(steps).toEqual([
      {
        kind: "While",
        line: 10,
        condition: {
          kind: "BinaryExpr",
          op: "<",
          left: { kind: "VariableRef", name: "x", suffix: "" },
          right: { kind: "NumberLiteral", value: 10 },
        },
        afterWend: { kind: "step", index: 3 },
      },
      {
        kind: "Print",
        line: 20,
        segments: [{ kind: "value", expr: { kind: "VariableRef", name: "x", suffix: "" } }],
      },
      { kind: "Wend", line: 30, whileTarget: { kind: "step", index: 0 } },
      {
        kind: "Print",
        line: 40,
        segments: [{ kind: "value", expr: { kind: "NumberLiteral", value: 1 } }],
      },
    ]);
  });

  it("resolves nested WHILE/WEND pairs independently (innermost matches innermost)", () => {
    const { steps } = lowerSource("10 WHILE X\n20 WHILE Y\n30 WEND\n40 WEND");
    const outerWhile = steps[0]!;
    const innerWhile = steps[1]!;
    const innerWend = steps[2]!;
    const outerWend = steps[3]!;
    if (outerWhile.kind !== "While" || innerWhile.kind !== "While")
      throw new Error("expected While");
    if (innerWend.kind !== "Wend" || outerWend.kind !== "Wend") throw new Error("expected Wend");
    expect(innerWhile.afterWend).toEqual({ kind: "step", index: 3 }); // jumps to outer WEND
    expect(innerWend.whileTarget).toEqual({ kind: "step", index: 1 }); // jumps back to inner WHILE
    expect(outerWhile.afterWend).toEqual({ kind: "step", index: 4 }); // jumps past everything
    expect(outerWend.whileTarget).toEqual({ kind: "step", index: 0 }); // jumps back to outer WHILE
  });

  it("throws a lowering-time error for a WEND with no matching WHILE", () => {
    expect(() => lowerSource("10 WEND")).toThrow(/WEND without a matching WHILE/);
  });

  it("throws a lowering-time error for a WHILE with no matching WEND", () => {
    expect(() => lowerSource("10 WHILE 1\n20 PRINT 1")).toThrow(/WHILE without a matching WEND/);
  });

  it("matches a WHILE/WEND pair split across an IF branch and the top level", () => {
    // WHILE/WEND resolution runs over the fully flattened Step[], so a
    // WHILE nested inside an inline THEN clause still matches a WEND
    // appearing as an ordinary top-level statement later.
    const { steps } = lowerSource("10 IF 1 THEN WHILE X: PRINT X\n20 WEND");
    const whileStep = steps.find((s) => s.kind === "While");
    const wendStep = steps.find((s) => s.kind === "Wend");
    expect(whileStep).toBeDefined();
    expect(wendStep).toBeDefined();
  });
});

describe("lower — DEF FN", () => {
  it("produces zero steps for a DefFnStmt (non-executable, like DATA)", () => {
    const { steps } = lowerSource("10 DEF FN D(X) = X * 2\n20 PRINT 1");
    expect(steps).toEqual([
      {
        kind: "Print",
        line: 20,
        segments: [{ kind: "value", expr: { kind: "NumberLiteral", value: 1 } }],
      },
    ]);
  });

  it("collects a DEF FN into the fnDefs registry, keyed by name + suffix", () => {
    const { fnDefs } = lowerSource("10 DEF FN SUM%(A, B) = A + B");
    expect(fnDefs.has("sum%")).toBe(true);
    expect(fnDefs.get("sum%")).toEqual({
      params: [
        { name: "a", suffix: "" },
        { name: "b", suffix: "" },
      ],
      body: {
        kind: "BinaryExpr",
        op: "+",
        left: { kind: "VariableRef", name: "a", suffix: "" },
        right: { kind: "VariableRef", name: "b", suffix: "" },
      },
    });
  });

  it("collects multiple DEF FNs from different lines", () => {
    const { fnDefs } = lowerSource("10 DEF FN A(X) = X\n20 DEF FN B(X) = X * 2");
    expect([...fnDefs.keys()].sort()).toEqual(["a", "b"]);
  });

  it("collects a DEF FN nested inside an IF branch", () => {
    // Mirrors collectData's IF-branch recursion — DEF FN is non-executable
    // and hoisted regardless of where in the source it textually sits.
    const { fnDefs } = lowerSource("10 IF 1 THEN DEF FN D(X) = X * 2");
    expect(fnDefs.has("d")).toBe(true);
  });
});

describe("lower — RANDOMIZE", () => {
  it("lowers RANDOMIZE 1:1 into a Randomize step", () => {
    const { steps } = lowerSource("10 RANDOMIZE 42");
    expect(steps).toEqual([
      { kind: "Randomize", line: 10, seed: { kind: "NumberLiteral", value: 42 } },
    ]);
  });
});

describe("lower — GW-BASIC dialect extension: OPEN/CLOSE/PRINT #/INPUT #", () => {
  it("lowers OPEN 1:1 into an Open step", () => {
    const { steps } = lowerSource('10 OPEN "A.TXT" FOR OUTPUT AS #1', "gwbasic");
    expect(steps).toEqual([
      {
        kind: "Open",
        line: 10,
        path: { kind: "StringLiteral", value: "A.TXT" },
        mode: "output",
        fileNumber: { kind: "NumberLiteral", value: 1 },
      },
    ]);
  });

  it("lowers CLOSE 1:1 into a Close step, preserving an empty (close-all) fileNumbers list", () => {
    expect(lowerSource("10 CLOSE #1, #2", "gwbasic").steps).toEqual([
      {
        kind: "Close",
        line: 10,
        fileNumbers: [
          { kind: "NumberLiteral", value: 1 },
          { kind: "NumberLiteral", value: 2 },
        ],
      },
    ]);
    expect(lowerSource("10 CLOSE", "gwbasic").steps).toEqual([
      { kind: "Close", line: 10, fileNumbers: [] },
    ]);
  });

  it("threads PRINT #'s fileNumber through into the Print step", () => {
    const { steps } = lowerSource('10 PRINT #1, "HI"', "gwbasic");
    expect(steps).toEqual([
      {
        kind: "Print",
        line: 10,
        fileNumber: { kind: "NumberLiteral", value: 1 },
        segments: [{ kind: "value", expr: { kind: "StringLiteral", value: "HI" } }],
      },
    ]);
  });

  it("threads INPUT #'s fileNumber through into the Input step", () => {
    const { steps } = lowerSource("10 INPUT #1, A$", "gwbasic");
    expect(steps).toEqual([
      {
        kind: "Input",
        line: 10,
        prompt: undefined,
        appendQuestionMark: false,
        fileNumber: { kind: "NumberLiteral", value: 1 },
        targets: [{ kind: "Variable", name: "a", suffix: "$" }],
      },
    ]);
  });

  it("an ordinary console PRINT still lowers with no fileNumber at all", () => {
    const { steps } = lowerSource('10 PRINT "HI"', "gwbasic");
    expect((steps[0] as { fileNumber?: unknown }).fileNumber).toBeUndefined();
  });
});
