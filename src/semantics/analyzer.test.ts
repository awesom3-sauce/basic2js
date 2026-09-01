import { describe, expect, it } from "vitest";
import { tokenize } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { analyze } from "./analyzer.js";
import type { Diagnostic } from "./diagnostic.js";
import type { Dialect } from "../dialect.js";

function analyzeSource(source: string, dialect?: Dialect): Diagnostic[] {
  return analyze(parse(tokenize(source, dialect), dialect));
}

describe("analyze — LET/assignment", () => {
  it("flags assigning a number to a string-suffixed target", () => {
    const diagnostics = analyzeSource("10 A$ = 5");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: "TYPE_MISMATCH", line: 10 });
    expect(diagnostics[0]?.message).toMatch(/cannot assign a number value to "a\$"/);
  });

  it("flags assigning a string to a numeric target", () => {
    const diagnostics = analyzeSource('10 A = "HI"');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toMatch(/cannot assign a string value to "a"/);
  });

  it("allows a matching string assignment", () => {
    expect(analyzeSource('10 A$ = "HI"')).toEqual([]);
  });

  it("allows a matching numeric assignment", () => {
    expect(analyzeSource("10 A = 5")).toEqual([]);
  });

  it("allows string concatenation into a string target", () => {
    expect(analyzeSource('10 A$ = "HI" + " THERE"')).toEqual([]);
  });

  it("flags a mismatch on an array-element assignment target", () => {
    const diagnostics = analyzeSource("10 A$(1) = 5");
    expect(diagnostics).toHaveLength(1);
  });
});

describe("analyze — FOR", () => {
  it("flags a string-suffixed loop variable", () => {
    const diagnostics = analyzeSource("10 FOR I$ = 1 TO 10");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toMatch(/FOR loop variable "i\$" cannot be a string/);
  });

  it("flags a string start/end/step expression", () => {
    expect(analyzeSource('10 FOR I = "X" TO 10')).toHaveLength(1);
    expect(analyzeSource('10 FOR I = 1 TO "X"')).toHaveLength(1);
    expect(analyzeSource('10 FOR I = 1 TO 10 STEP "X"')).toHaveLength(1);
  });

  it("allows an ordinary numeric FOR", () => {
    expect(analyzeSource("10 FOR I = 1 TO 10 STEP 2")).toEqual([]);
  });
});

describe("analyze — IF/WHILE conditions", () => {
  it("flags a string IF condition", () => {
    const diagnostics = analyzeSource('10 IF "X" THEN PRINT 1');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toMatch(/IF condition must be numeric/);
  });

  it("flags a string WHILE condition", () => {
    const diagnostics = analyzeSource('10 WHILE "X"\n20 WEND');
    expect(diagnostics).toHaveLength(1);
  });

  it("recurses into inline THEN/ELSE branches", () => {
    const diagnostics = analyzeSource('10 IF 1 THEN A$ = 5 ELSE B = "X"');
    expect(diagnostics).toHaveLength(2);
  });

  it("allows an ordinary numeric condition", () => {
    expect(analyzeSource("10 IF X = 1 THEN PRINT 1")).toEqual([]);
  });
});

describe("analyze — ON...GOTO/GOSUB, DIM, RANDOMIZE", () => {
  it("flags a string ON...GOTO selector", () => {
    expect(analyzeSource('10 ON "X" GOTO 20\n20 END')).toHaveLength(1);
  });

  it("flags a string DIM size", () => {
    expect(analyzeSource('10 DIM A("X")')).toHaveLength(1);
  });

  it("flags a string RANDOMIZE seed", () => {
    expect(analyzeSource('10 RANDOMIZE "X"')).toHaveLength(1);
  });

  it("allows ordinary numeric usages", () => {
    expect(analyzeSource("10 ON N GOTO 20, 30\n20 END\n30 END")).toEqual([]);
    expect(analyzeSource("10 DIM A(10)")).toEqual([]);
    expect(analyzeSource("10 RANDOMIZE 42")).toEqual([]);
  });
});

describe("analyze — not checked at compile time", () => {
  it("does not flag READ regardless of target suffix (DATA types aren't statically correlated)", () => {
    expect(analyzeSource("10 DATA 5\n20 READ A$")).toEqual([]);
  });

  it("does not flag INPUT regardless of target suffix (no static source)", () => {
    expect(analyzeSource("10 INPUT A$")).toEqual([]);
  });
});

describe("analyze — collects multiple diagnostics across a program", () => {
  it("reports every mismatch, not just the first", () => {
    const diagnostics = analyzeSource('10 A$ = 5\n20 B = "X"\n30 FOR I$ = 1 TO 10');
    expect(diagnostics).toHaveLength(3);
    expect(diagnostics.map((d) => d.line)).toEqual([10, 20, 30]);
  });
});

describe("analyze — UNDEFINED_LINE (build order step 16)", () => {
  it("flags a GOTO to a nonexistent line", () => {
    const diagnostics = analyzeSource("10 GOTO 999\n20 END");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: "UNDEFINED_LINE", line: 10 });
    expect(diagnostics[0]?.message).toMatch(/line 999 does not exist/);
  });

  it("flags a GOSUB to a nonexistent line", () => {
    expect(analyzeSource("10 GOSUB 999\n20 END")).toHaveLength(1);
  });

  it("flags only the undefined target in an ON...GOTO/GOSUB list, not the valid one", () => {
    const diagnostics = analyzeSource("10 ON N GOTO 20, 999\n20 END");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toMatch(/line 999/);
  });

  it("flags an IF/THEN line-number branch target", () => {
    expect(analyzeSource("10 IF 1 THEN 999\n20 END")).toHaveLength(1);
  });

  it("flags an IF/THEN...ELSE line-number branch target", () => {
    expect(analyzeSource("10 IF 1 THEN 20 ELSE 999\n20 END")).toHaveLength(1);
  });

  it("does not flag an inline THEN/ELSE statement list (no line-number target to check)", () => {
    expect(analyzeSource('10 IF 1 THEN PRINT "A" ELSE PRINT "B"')).toEqual([]);
  });

  it("flags a RESTORE to a nonexistent line", () => {
    expect(analyzeSource("10 DATA 1\n20 RESTORE 999\n30 END")).toHaveLength(1);
  });

  it("does not flag a bare RESTORE (no target to check)", () => {
    expect(analyzeSource("10 DATA 1\n20 RESTORE\n30 END")).toEqual([]);
  });

  it("allows every jump target that does resolve to a real line", () => {
    expect(
      analyzeSource(
        "10 GOTO 20\n20 GOSUB 30\n30 ON 1 GOTO 40, 50\n40 IF 1 THEN 50 ELSE 20\n50 RETURN",
      ),
    ).toEqual([]);
  });
});

describe("analyze — GW-BASIC dialect extension: OPEN/CLOSE", () => {
  it("flags a non-string OPEN path", () => {
    const diagnostics = analyzeSource("10 OPEN 5 FOR OUTPUT AS #1", "gwbasic");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toMatch(/an OPEN path must be a string/);
  });

  it("flags a string OPEN file number", () => {
    const diagnostics = analyzeSource('10 OPEN "A" FOR OUTPUT AS "X"', "gwbasic");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.message).toMatch(/an OPEN file number must be numeric/);
  });

  it("flags each string CLOSE file number in a multi-file list", () => {
    expect(analyzeSource('10 CLOSE #1, "X"', "gwbasic")).toHaveLength(1);
    expect(analyzeSource('10 CLOSE "X", "Y"', "gwbasic")).toHaveLength(2);
  });

  it("allows an ordinary well-typed OPEN/CLOSE pair", () => {
    expect(analyzeSource('10 OPEN "A.TXT" FOR OUTPUT AS #1\n20 CLOSE #1', "gwbasic")).toEqual([]);
  });

  it("allows a bare CLOSE (no file numbers to check)", () => {
    expect(analyzeSource("10 CLOSE", "gwbasic")).toEqual([]);
  });
});
