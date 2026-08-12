// Behavioral tests: compile a small BASIC snippet all the way to JS and
// execute it against TestRuntime, asserting on captured output — per
// CLAUDE.md's "How to add a new BASIC statement" testing convention.
// Preferred over asserting on the emitted JS text directly, which would be
// brittle (whitespace-sensitive) without checking anything more meaningful
// than what these tests already verify by actually running the code.

import { describe, expect, it } from "vitest";
import { compile } from "../index.js";
import { importModuleFromSource } from "../util/load-js-module.js";
import { TestRuntime } from "../../tests/helpers/test-runtime.js";
import type { BasicRuntime } from "../runtime/interface.js";

async function runBasic(source: string, scriptedInput: string[] = []): Promise<TestRuntime> {
  const { js } = compile(source);
  const mod = await importModuleFromSource(js);
  const run = mod.run as (rt: BasicRuntime) => Promise<void>;
  const rt = new TestRuntime(scriptedInput);
  await run(rt);
  return rt;
}

describe("emit — PRINT", () => {
  it("prints a string literal with a trailing newline", async () => {
    const rt = await runBasic('10 PRINT "HELLO"');
    expect(rt.output).toBe("HELLO\n");
  });

  it("formats non-negative numbers with a leading and trailing space", async () => {
    const rt = await runBasic("10 PRINT 5");
    expect(rt.output).toBe(" 5 \n");
  });

  it("formats negative numbers with just a trailing space", async () => {
    const rt = await runBasic("10 PRINT -5");
    expect(rt.output).toBe("-5 \n");
  });

  it("concatenates ;-separated values with no separator of its own", async () => {
    const rt = await runBasic('10 PRINT "X="; 5');
    expect(rt.output).toBe("X= 5 \n");
  });

  it("suppresses the trailing newline after a trailing separator", async () => {
    const rt = await runBasic('10 PRINT "A";');
    expect(rt.output).toBe("A");
  });

  it("pads ,-separated values to the next 14-column tab zone", async () => {
    const rt = await runBasic('10 PRINT "AB",1');
    // "AB" is 2 chars; the next zone is column 14, so 12 spaces of padding.
    expect(rt.output).toBe("AB" + " ".repeat(12) + " 1 " + "\n");
  });

  it("prints a blank line for a bare PRINT", async () => {
    const rt = await runBasic("10 PRINT");
    expect(rt.output).toBe("\n");
  });
});

describe("emit — LET / variables", () => {
  it("assigns and reads back a variable", async () => {
    const rt = await runBasic("10 LET A = 5\n20 PRINT A");
    expect(rt.output).toBe(" 5 \n");
  });

  it("keeps variables with different type suffixes distinct", async () => {
    const rt = await runBasic('10 A = 1\n20 A$ = "hi"\n30 PRINT A\n40 PRINT A$');
    expect(rt.output).toBe(" 1 \nhi\n");
  });

  it("supports implicit assignment without LET", async () => {
    const rt = await runBasic("10 A = 42\n20 PRINT A");
    expect(rt.output).toBe(" 42 \n");
  });
});

describe("emit — arithmetic expressions", () => {
  it("gives * higher precedence than +", async () => {
    const rt = await runBasic("10 PRINT 1 + 2 * 3");
    expect(rt.output).toBe(" 7 \n");
  });

  it("respects parenthesized grouping", async () => {
    const rt = await runBasic("10 PRINT (1 + 2) * 3");
    expect(rt.output).toBe(" 9 \n");
  });

  it("makes ^ right-associative (2^3^2 = 2^(3^2) = 512)", async () => {
    const rt = await runBasic("10 PRINT 2 ^ 3 ^ 2");
    expect(rt.output).toBe(" 512 \n");
  });

  it("binds unary minus looser than ^ (-2^2 = -4)", async () => {
    const rt = await runBasic("10 PRINT -2 ^ 2");
    expect(rt.output).toBe("-4 \n");
  });

  it("binds unary minus tighter than * (-2*3 = -6)", async () => {
    const rt = await runBasic("10 PRINT -2 * 3");
    expect(rt.output).toBe("-6 \n");
  });

  it("evaluates integer division, truncating toward zero", async () => {
    const rt = await runBasic("10 PRINT 7 \\ 2");
    expect(rt.output).toBe(" 3 \n");
  });

  it("evaluates MOD with sign following the dividend", async () => {
    const rt = await runBasic("10 PRINT 7 MOD 2");
    expect(rt.output).toBe(" 1 \n");
    const rtNeg = await runBasic("10 PRINT -7 MOD 2");
    expect(rtNeg.output).toBe("-1 \n");
  });

  it("concatenates strings with +", async () => {
    const rt = await runBasic('10 PRINT "foo" + "bar"');
    expect(rt.output).toBe("foobar\n");
  });
});

describe("emit — GOTO / dispatch loop", () => {
  it("jumps forward, skipping intermediate statements", async () => {
    const rt = await runBasic('10 GOTO 30\n20 PRINT "SKIPPED"\n30 PRINT "HERE"');
    expect(rt.output).toBe("HERE\n");
  });

  it("jumps backward and then halts via END, without looping forever", async () => {
    const rt = await runBasic(
      [
        "10 GOTO 40",
        '20 PRINT "BACKWARD TARGET"',
        "30 END",
        '40 PRINT "FORWARD"',
        "50 GOTO 20",
      ].join("\n"),
    );
    expect(rt.output).toBe("FORWARD\nBACKWARD TARGET\n");
  });

  it("halts on END without executing anything after it", async () => {
    const rt = await runBasic('10 PRINT "BEFORE"\n20 END\n30 PRINT "AFTER"');
    expect(rt.output).toBe("BEFORE\n");
  });

  it("halts on STOP the same way as END", async () => {
    const rt = await runBasic('10 PRINT "BEFORE"\n20 STOP\n30 PRINT "AFTER"');
    expect(rt.output).toBe("BEFORE\n");
  });

  it("naturally halts by falling off the end of the program with no explicit END", async () => {
    const rt = await runBasic('10 PRINT "ONLY LINE"');
    expect(rt.output).toBe("ONLY LINE\n");
  });
});

describe("emit — REM / comments", () => {
  it("has no effect on program output", async () => {
    const rt = await runBasic('10 REM does nothing\n20 PRINT "HI"\n30 X = 1 \'trailing note');
    expect(rt.output).toBe("HI\n");
  });
});

describe("emit — colon-separated statements", () => {
  it("executes every statement on a line in order", async () => {
    const rt = await runBasic("10 A = 1: B = 2: PRINT A + B");
    expect(rt.output).toBe(" 3 \n");
  });
});

describe("emit — comparisons and logical operators", () => {
  it("represents TRUE as -1 and FALSE as 0, classic-BASIC style", async () => {
    const rt = await runBasic("10 PRINT 1 = 1\n20 PRINT 1 = 2");
    expect(rt.output).toBe("-1 \n 0 \n");
  });

  it("evaluates every comparison operator", async () => {
    const rt = await runBasic(
      [
        "10 PRINT 1 <> 2",
        "20 PRINT 1 < 2",
        "30 PRINT 2 > 1",
        "40 PRINT 1 <= 1",
        "50 PRINT 1 >= 1",
      ].join("\n"),
    );
    expect(rt.output).toBe("-1 \n-1 \n-1 \n-1 \n-1 \n");
  });

  it("evaluates AND/OR bitwise, matching logical AND/OR for 0/-1 operands", async () => {
    const rt = await runBasic("10 PRINT (1 = 1) AND (2 = 2)\n20 PRINT (1 = 1) AND (2 = 3)");
    expect(rt.output).toBe("-1 \n 0 \n");
    const rt2 = await runBasic("10 PRINT (1 = 2) OR (2 = 2)\n20 PRINT (1 = 2) OR (2 = 3)");
    expect(rt2.output).toBe("-1 \n 0 \n");
  });

  it("evaluates NOT as bitwise complement, matching logical NOT for 0/-1 operands", async () => {
    const rt = await runBasic("10 PRINT NOT (1 = 1)\n20 PRINT NOT (1 = 2)");
    expect(rt.output).toBe(" 0 \n-1 \n");
  });

  it("compares strings lexicographically", async () => {
    const rt = await runBasic('10 PRINT "APPLE" = "APPLE"\n20 PRINT "APPLE" < "BANANA"');
    expect(rt.output).toBe("-1 \n-1 \n");
  });
});

describe("emit — IF/THEN/ELSE", () => {
  it("takes the THEN branch (a GOTO line target) when the condition is true", async () => {
    const rt = await runBasic('10 IF 1 = 1 THEN 30\n20 PRINT "SKIPPED"\n30 PRINT "THEN"');
    expect(rt.output).toBe("THEN\n");
  });

  it("falls through past the THEN line target when the condition is false", async () => {
    const rt = await runBasic('10 IF 1 = 2 THEN 30\n20 PRINT "FALLTHROUGH"\n30 PRINT "THEN"');
    expect(rt.output).toBe("FALLTHROUGH\nTHEN\n");
  });

  it("takes the ELSE branch (a GOTO line target) when the condition is false", async () => {
    const rt = await runBasic(
      '10 IF 1 = 2 THEN 30 ELSE 40\n20 END\n30 PRINT "THEN"\n40 PRINT "ELSE"',
    );
    expect(rt.output).toBe("ELSE\n");
  });

  it("executes an inline THEN statement list when true", async () => {
    const rt = await runBasic('10 IF 1 = 1 THEN PRINT "A": PRINT "B"\n20 PRINT "NEXT LINE"');
    expect(rt.output).toBe("A\nB\nNEXT LINE\n");
  });

  it("skips an inline THEN statement list when false, with no ELSE", async () => {
    const rt = await runBasic('10 IF 1 = 2 THEN PRINT "A": PRINT "B"\n20 PRINT "NEXT LINE"');
    expect(rt.output).toBe("NEXT LINE\n");
  });

  it("executes the inline ELSE statement list when false, never falling into it from THEN", async () => {
    const rt = await runBasic('10 IF 1 = 2 THEN PRINT "A" ELSE PRINT "B"\n20 PRINT "NEXT LINE"');
    expect(rt.output).toBe("B\nNEXT LINE\n");
  });

  it("executes only the THEN branch when true, never falling through into ELSE", async () => {
    const rt = await runBasic('10 IF 1 = 1 THEN PRINT "A" ELSE PRINT "B"\n20 PRINT "NEXT LINE"');
    expect(rt.output).toBe("A\nNEXT LINE\n");
  });

  it("supports nested IF inside a THEN branch", async () => {
    const rt = await runBasic('10 IF 1 = 1 THEN IF 2 = 2 THEN PRINT "BOTH TRUE"\n20 PRINT "DONE"');
    expect(rt.output).toBe("BOTH TRUE\nDONE\n");
  });

  it("halts gracefully when a THEN branch falls off the end of the last line with no next line", async () => {
    const rt = await runBasic('10 IF 1 = 1 THEN PRINT "ONLY"');
    expect(rt.output).toBe("ONLY\n");
  });

  it("runs a real bounded counting loop, now that IF/THEN provides a way to escape GOTO", async () => {
    const rt = await runBasic(
      [
        "10 LET N = 1",
        "20 PRINT N",
        "30 LET N = N + 1",
        "40 IF N <= 5 THEN 20",
        '50 PRINT "DONE"',
      ].join("\n"),
    );
    expect(rt.output).toBe(" 1 \n 2 \n 3 \n 4 \n 5 \nDONE\n");
  });
});

describe("emit — FOR/NEXT", () => {
  it("counts up over the inclusive range, defaulting STEP to 1", async () => {
    const rt = await runBasic("10 FOR I = 1 TO 5\n20 PRINT I\n30 NEXT I");
    expect(rt.output).toBe(" 1 \n 2 \n 3 \n 4 \n 5 \n");
  });

  it("counts down with a negative STEP", async () => {
    const rt = await runBasic("10 FOR I = 5 TO 1 STEP -1\n20 PRINT I\n30 NEXT I");
    expect(rt.output).toBe(" 5 \n 4 \n 3 \n 2 \n 1 \n");
  });

  it("respects a STEP that doesn't evenly divide the range", async () => {
    const rt = await runBasic("10 FOR I = 1 TO 10 STEP 3\n20 PRINT I\n30 NEXT I");
    expect(rt.output).toBe(" 1 \n 4 \n 7 \n 10 \n");
  });

  it("does not pre-test the condition: the body runs once even if start already fails the end test", async () => {
    // Classic BASIC quirk: FOR doesn't check start<=end before the first
    // iteration, only NEXT checks whether to continue. See DIALECT.md.
    const rt = await runBasic("10 FOR I = 1 TO 0\n20 PRINT I\n30 NEXT I");
    expect(rt.output).toBe(" 1 \n");
  });

  it("supports a bare NEXT matching the innermost FOR", async () => {
    const rt = await runBasic("10 FOR I = 1 TO 3\n20 PRINT I\n30 NEXT");
    expect(rt.output).toBe(" 1 \n 2 \n 3 \n");
  });

  it("supports properly nested FOR loops", async () => {
    const rt = await runBasic(
      "10 FOR I = 1 TO 2\n20 FOR J = 1 TO 2\n30 PRINT I; J\n40 NEXT J\n50 NEXT I",
    );
    expect(rt.output).toBe(" 1  1 \n 1  2 \n 2  1 \n 2  2 \n");
  });

  it("evaluates end/step using the loop variable's pre-loop value, not the just-assigned start", async () => {
    // FOR I = 1 TO I * 2 with I previously 3: end should be 6 (3*2), not 2 (1*2).
    const rt = await runBasic("10 LET I = 3\n20 FOR I = 1 TO I * 2\n30 PRINT I\n40 NEXT I");
    expect(rt.output).toBe(" 1 \n 2 \n 3 \n 4 \n 5 \n 6 \n");
  });

  it("raises NEXT WITHOUT FOR when the stack is empty", async () => {
    const rt = await runBasic("10 NEXT");
    expect(rt.output).toBe("");
    expect(rt.errors).toHaveLength(1);
    expect(rt.errors[0]?.message).toMatch(/NEXT WITHOUT FOR/);
  });

  it("lets NEXT <outer var> implicitly close an inner loop GOTO abandoned without its own NEXT", async () => {
    const rt = await runBasic(
      [
        "10 FOR I = 1 TO 3",
        "20 FOR J = 1 TO 3",
        "30 IF J = 2 THEN 60",
        "40 PRINT I; J",
        "50 NEXT J",
        "60 NEXT I",
      ].join("\n"),
    );
    // Each outer iteration abandons J's loop after J=1 (jumping straight
    // to "NEXT I"), discarding J's frame; I's loop still runs 1..3.
    expect(rt.output).toBe(" 1  1 \n 2  1 \n 3  1 \n");
  });

  it("runs a real counting loop built with FOR/NEXT instead of GOTO/IF", async () => {
    const rt = await runBasic('10 FOR N = 1 TO 5\n20 PRINT N\n30 NEXT N\n40 PRINT "DONE"');
    expect(rt.output).toBe(" 1 \n 2 \n 3 \n 4 \n 5 \nDONE\n");
  });
});

describe("emit — GOSUB/RETURN", () => {
  it("jumps to the subroutine and returns to the statement right after the GOSUB", async () => {
    const rt = await runBasic(
      '10 GOSUB 100\n20 PRINT "BACK"\n30 END\n100 PRINT "IN SUB"\n110 RETURN',
    );
    expect(rt.output).toBe("IN SUB\nBACK\n");
  });

  it("supports nested GOSUB calls, returning in the correct (LIFO) order", async () => {
    const rt = await runBasic(
      [
        "10 GOSUB 100",
        '20 PRINT "DONE"',
        "30 END",
        '100 PRINT "A"',
        "110 GOSUB 200",
        '120 PRINT "B"',
        "130 RETURN",
        '200 PRINT "C"',
        "210 RETURN",
      ].join("\n"),
    );
    expect(rt.output).toBe("A\nC\nB\nDONE\n");
  });

  it("raises RETURN WITHOUT GOSUB when the stack is empty", async () => {
    const rt = await runBasic("10 RETURN");
    expect(rt.output).toBe("");
    expect(rt.errors).toHaveLength(1);
    expect(rt.errors[0]?.message).toMatch(/RETURN WITHOUT GOSUB/);
  });

  it("supports GOSUB inside a loop, returning to resume the loop correctly", async () => {
    const rt = await runBasic(
      [
        "10 FOR I = 1 TO 3",
        "20 GOSUB 100",
        "30 NEXT I",
        "40 END",
        "100 PRINT I",
        "110 RETURN",
      ].join("\n"),
    );
    expect(rt.output).toBe(" 1 \n 2 \n 3 \n");
  });
});

describe("emit — ON...GOTO / ON...GOSUB", () => {
  it("jumps to the nth target for a matching selector (1-indexed)", async () => {
    const rt = await runBasic(
      '10 N = 2\n20 ON N GOTO 100, 200, 300\n30 END\n100 PRINT "ONE": END\n200 PRINT "TWO": END\n300 PRINT "THREE": END',
    );
    expect(rt.output).toBe("TWO\n");
  });

  it("falls through with no error when the selector is out of range", async () => {
    const rt = await runBasic(
      '10 N = 5\n20 ON N GOTO 100, 200\n30 PRINT "FALLTHROUGH"\n40 END\n100 PRINT "ONE"\n200 PRINT "TWO"',
    );
    expect(rt.output).toBe("FALLTHROUGH\n");
    expect(rt.errors).toHaveLength(0);
  });

  it("falls through with no error when the selector is less than 1", async () => {
    const rt = await runBasic(
      '10 N = 0\n20 ON N GOTO 100\n30 PRINT "FALLTHROUGH"\n40 END\n100 PRINT "ONE"',
    );
    expect(rt.output).toBe("FALLTHROUGH\n");
  });

  it("calls the nth target as a subroutine for ON...GOSUB, returning correctly", async () => {
    const rt = await runBasic(
      [
        "10 FOR N = 1 TO 2",
        "20 ON N GOSUB 100, 200",
        '30 PRINT "AFTER"; N',
        "40 NEXT N",
        "50 END",
        '100 PRINT "SUB1"',
        "110 RETURN",
        '200 PRINT "SUB2"',
        "210 RETURN",
      ].join("\n"),
    );
    expect(rt.output).toBe("SUB1\nAFTER 1 \nSUB2\nAFTER 2 \n");
  });

  it("pushes no return address for an out-of-range ON...GOSUB selector", async () => {
    // If a return address were wrongly pushed, this RETURN would succeed
    // and jump somewhere bogus instead of raising RETURN WITHOUT GOSUB.
    const rt = await runBasic('10 N = 99\n20 ON N GOSUB 100\n30 PRINT "AFTER"\n40 END\n100 RETURN');
    expect(rt.output).toBe("AFTER\n");
    expect(rt.errors).toHaveLength(0);
  });
});

describe("emit — INPUT", () => {
  it("reads a numeric value and coerces it", async () => {
    const rt = await runBasic("10 INPUT X\n20 PRINT X * 2", ["21"]);
    expect(rt.output).toBe("?  42 \n");
  });

  it("reads a string value, trimmed", async () => {
    const rt = await runBasic("10 INPUT A$\n20 PRINT A$", ["  spaced  "]);
    expect(rt.output).toBe("? spaced\n");
  });

  it('shows "prompt? " for a prompt followed by ";"', async () => {
    const rt = await runBasic('10 INPUT "Enter name"; N$\n20 PRINT "Hello, "; N$', ["World"]);
    expect(rt.output).toBe("Enter name? Hello, World\n");
  });

  it('shows just "prompt" (no "?") for a prompt followed by ","', async () => {
    const rt = await runBasic('10 INPUT "Enter value", X\n20 PRINT X', ["5"]);
    expect(rt.output).toBe("Enter value 5 \n");
  });

  it("splits a single comma-separated response across multiple targets", async () => {
    const rt = await runBasic("10 INPUT A, B\n20 PRINT A + B", ["3,4"]);
    expect(rt.output).toBe("?  7 \n");
  });

  it("supports multiple INPUT statements in sequence", async () => {
    const rt = await runBasic("10 INPUT A\n20 INPUT B\n30 PRINT A + B", ["10", "20"]);
    expect(rt.output).toBe("? ?  30 \n");
  });

  it("supports INPUT inside a loop", async () => {
    const rt = await runBasic("10 FOR I = 1 TO 3\n20 INPUT X\n30 PRINT X * 10\n40 NEXT I", [
      "1",
      "2",
      "3",
    ]);
    expect(rt.output).toBe("?  10 \n?  20 \n?  30 \n");
  });

  it("defaults unparseable numeric input to 0 rather than crashing", async () => {
    const rt = await runBasic("10 INPUT X\n20 PRINT X", ["not a number"]);
    expect(rt.output).toBe("?  0 \n");
    expect(rt.errors).toHaveLength(0);
  });
});

describe("emit — DIM / arrays", () => {
  it("stores and reads back 1D array elements", async () => {
    const rt = await runBasic("10 DIM A(5)\n20 A(0) = 10\n30 A(5) = 50\n40 PRINT A(0); A(5)");
    expect(rt.output).toBe(" 10  50 \n");
  });

  it("lazily allocates an undeclared array at default size 10 per dimension", async () => {
    const rt = await runBasic("10 A(3) = 99\n20 PRINT A(3)");
    expect(rt.output).toBe(" 99 \n");
  });

  it("supports 2D arrays with independent row/column indices", async () => {
    const rt = await runBasic(
      [
        "10 DIM B(2, 2)",
        "20 FOR I = 0 TO 2",
        "30 FOR J = 0 TO 2",
        "40 B(I, J) = I * 10 + J",
        "50 NEXT J",
        "60 NEXT I",
        "70 PRINT B(1, 2)",
      ].join("\n"),
    );
    expect(rt.output).toBe(" 12 \n");
  });

  it("supports string arrays, defaulting elements to empty string", async () => {
    const rt = await runBasic(
      '10 DIM N$(2)\n20 PRINT "["; N$(0); "]"\n30 N$(0) = "Alice"\n40 PRINT N$(0)',
    );
    expect(rt.output).toBe("[]\nAlice\n");
  });

  it("raises SUBSCRIPT OUT OF RANGE for an out-of-bounds index", async () => {
    const rt = await runBasic("10 DIM A(3)\n20 A(10) = 1");
    expect(rt.output).toBe("");
    expect(rt.errors).toHaveLength(1);
    expect(rt.errors[0]?.message).toMatch(/SUBSCRIPT OUT OF RANGE/);
  });

  it("raises SUBSCRIPT OUT OF RANGE for a negative index", async () => {
    const rt = await runBasic("10 DIM A(3)\n20 PRINT A(-1)");
    expect(rt.errors).toHaveLength(1);
    expect(rt.errors[0]?.message).toMatch(/SUBSCRIPT OUT OF RANGE/);
  });

  it("keeps a scalar and an array of the same name in separate namespaces", async () => {
    const rt = await runBasic("10 A = 5\n20 DIM A(3)\n30 A(0) = 99\n40 PRINT A; A(0)");
    expect(rt.output).toBe(" 5  99 \n");
  });

  it("supports array elements inside arithmetic expressions", async () => {
    const rt = await runBasic("10 DIM A(3)\n20 A(0) = 5\n30 A(1) = 10\n40 PRINT A(0) + A(1)");
    expect(rt.output).toBe(" 15 \n");
  });

  it("supports INPUT directly into an array element", async () => {
    const rt = await runBasic("10 DIM A(3)\n20 INPUT A(0)\n30 PRINT A(0) * 2", ["21"]);
    expect(rt.output).toBe("?  42 \n");
  });
});

describe("emit — DATA/READ/RESTORE", () => {
  it("reads numeric DATA values in order", async () => {
    const rt = await runBasic("10 DATA 1, 2, 3\n20 READ A, B, C\n30 PRINT A + B + C");
    expect(rt.output).toBe(" 6 \n");
  });

  it("reads mixed string and negative-number DATA values", async () => {
    const rt = await runBasic('10 DATA "Alice", -5, "Bob"\n20 READ N$, X, M$\n30 PRINT N$; X; M$');
    expect(rt.output).toBe("Alice-5 Bob\n");
  });

  it("supports READ inside a loop", async () => {
    const rt = await runBasic(
      "10 DATA 10, 20, 30, 40\n20 FOR I = 1 TO 4\n30 READ X\n40 PRINT X\n50 NEXT I",
    );
    expect(rt.output).toBe(" 10 \n 20 \n 30 \n 40 \n");
  });

  it("collects DATA from multiple lines into one pool regardless of interleaved statements", async () => {
    const rt = await runBasic(
      '10 DATA 1\n20 PRINT "between"\n30 DATA 2, 3\n40 READ A, B, C\n50 PRINT A; B; C',
    );
    expect(rt.output).toBe("between\n 1  2  3 \n");
  });

  it("supports READ into an array element", async () => {
    const rt = await runBasic(
      "10 DIM A(3)\n20 DATA 5, 10, 15\n30 FOR I = 0 TO 2\n40 READ A(I)\n50 NEXT I\n60 PRINT A(0); A(1); A(2)",
    );
    expect(rt.output).toBe(" 5  10  15 \n");
  });

  it("raises OUT OF DATA when reading past the end of the pool", async () => {
    const rt = await runBasic("10 DATA 1\n20 READ A, B");
    expect(rt.output).toBe("");
    expect(rt.errors).toHaveLength(1);
    expect(rt.errors[0]?.message).toMatch(/OUT OF DATA/);
  });

  it("bare RESTORE resets the pointer to the start of the pool", async () => {
    const rt = await runBasic(
      "10 DATA 1, 2\n20 READ A, B\n30 RESTORE\n40 READ C, D\n50 PRINT A; B; C; D",
    );
    expect(rt.output).toBe(" 1  2  1  2 \n");
  });

  it("RESTORE <line> resets the pointer to that line's first DATA value", async () => {
    const rt = await runBasic(
      "10 DATA 1, 2\n20 DATA 3, 4\n30 READ A, B, C, D\n40 RESTORE 20\n50 READ E, F\n60 PRINT A;B;C;D;E;F",
    );
    expect(rt.output).toBe(" 1  2  3  4  3  4 \n");
  });

  it("raises a clear error for RESTORE targeting a line with no DATA of its own", async () => {
    const rt = await runBasic("10 DATA 1\n20 PRINT 2\n30 RESTORE 20");
    expect(rt.errors).toHaveLength(1);
    expect(rt.errors[0]?.message).toMatch(/RESTORE: no DATA at line 20/);
  });
});

describe("emit — WHILE/WEND", () => {
  it("loops while the condition is truthy", async () => {
    const rt = await runBasic(
      '10 LET I = 1\n20 WHILE I <= 3\n30 PRINT I\n40 LET I = I + 1\n50 WEND\n60 PRINT "DONE"',
    );
    expect(rt.output).toBe(" 1 \n 2 \n 3 \nDONE\n");
  });

  it("pre-tests the condition: the body never runs if it's false from the start (unlike FOR)", async () => {
    const rt = await runBasic(
      '10 LET I = 5\n20 WHILE I <= 3\n30 PRINT I\n40 WEND\n50 PRINT "DONE"',
    );
    expect(rt.output).toBe("DONE\n");
  });

  it("supports properly nested WHILE loops", async () => {
    const rt = await runBasic(
      [
        "10 LET I = 1",
        "20 WHILE I <= 2",
        "30 LET J = 1",
        "40 WHILE J <= 2",
        "50 PRINT I; J",
        "60 LET J = J + 1",
        "70 WEND",
        "80 LET I = I + 1",
        "90 WEND",
      ].join("\n"),
    );
    expect(rt.output).toBe(" 1  1 \n 1  2 \n 2  1 \n 2  2 \n");
  });

  it("supports WHILE/WEND split across an inline IF/THEN branch and the top level", async () => {
    const rt = await runBasic(
      '10 IF 1 = 1 THEN LET I = 1: WHILE I <= 2: PRINT I: LET I = I + 1: WEND\n20 PRINT "AFTER"',
    );
    expect(rt.output).toBe(" 1 \n 2 \nAFTER\n");
  });

  it("rejects a WEND with no matching WHILE at compile time", async () => {
    await expect(runBasic("10 WEND")).rejects.toThrow(/WEND without a matching WHILE/);
  });

  it("rejects a WHILE with no matching WEND at compile time", async () => {
    await expect(runBasic("10 WHILE 1\n20 PRINT 1")).rejects.toThrow(
      /WHILE without a matching WEND/,
    );
  });
});

describe("emit — DEF FN", () => {
  it("calls a single-parameter user function", async () => {
    const rt = await runBasic("10 DEF FN D(X) = X * 2\n20 PRINT FN D(5)\n30 END");
    expect(rt.output).toBe(" 10 \n");
  });

  it("shadows a same-named global variable with the parameter, without mutating the global", async () => {
    const rt = await runBasic(
      "10 X = 100\n20 DEF FN D(X) = X * 2\n30 PRINT FN D(5)\n40 PRINT X\n50 END",
    );
    expect(rt.output).toBe(" 10 \n 100 \n");
  });

  it("reads a free (non-parameter) variable from live caller state, not a snapshot", async () => {
    const rt = await runBasic(
      "10 K = 10\n20 DEF FN ADDK(X) = X + K\n30 PRINT FN ADDK(5)\n40 K = 20\n50 PRINT FN ADDK(5)\n60 END",
    );
    expect(rt.output).toBe(" 15 \n 25 \n");
  });

  it("supports nested FN calls", async () => {
    const rt = await runBasic(
      "10 DEF FN SQR2(X) = X * X\n20 DEF FN QUAD(X) = FN SQR2(FN SQR2(X))\n30 PRINT FN QUAD(2)\n40 END",
    );
    expect(rt.output).toBe(" 16 \n");
  });

  it("supports a zero-argument FN call", async () => {
    const rt = await runBasic("10 DEF FN PI() = 3.14159\n20 PRINT FN PI()\n30 END");
    expect(rt.output).toBe(" 3.14159 \n");
  });

  it("supports a multi-parameter FN call", async () => {
    const rt = await runBasic("10 DEF FN SUM(A, B) = A + B\n20 PRINT FN SUM(3, 4)\n30 END");
    expect(rt.output).toBe(" 7 \n");
  });
});

describe("emit — string builtins", () => {
  it("LEFT$/RIGHT$/MID$ extract substrings", async () => {
    const rt = await runBasic(
      '10 A$ = "HELLO WORLD"\n' +
        "20 PRINT LEFT$(A$, 5)\n" +
        "30 PRINT RIGHT$(A$, 5)\n" +
        "40 PRINT MID$(A$, 7)\n" +
        "50 PRINT MID$(A$, 1, 5)\n" +
        "60 END",
    );
    expect(rt.output).toBe("HELLO\nWORLD\nWORLD\nHELLO\n");
  });

  it("LEFT$/RIGHT$ clamp n beyond the string's length instead of erroring", async () => {
    const rt = await runBasic('10 PRINT LEFT$("HI", 10)\n20 PRINT RIGHT$("HI", 10)\n30 END');
    expect(rt.output).toBe("HI\nHI\n");
  });

  it("LEN returns a string's character count", async () => {
    const rt = await runBasic('10 PRINT LEN("HELLO")\n20 PRINT LEN("")\n30 END');
    expect(rt.output).toBe(" 5 \n 0 \n");
  });

  it("CHR$/ASC round-trip a character code", async () => {
    const rt = await runBasic('10 PRINT CHR$(65)\n20 PRINT ASC("A")\n30 END');
    expect(rt.output).toBe("A\n 65 \n");
  });

  it("ASC on an empty string is a runtime error", async () => {
    const rt = await runBasic('10 PRINT ASC("")\n20 END');
    expect(rt.errors).toHaveLength(1);
    expect(rt.errors[0]?.message).toMatch(/ASC of an empty string/);
  });

  it("STR$ prepends a leading space for non-negative numbers, no trailing space", async () => {
    const rt = await runBasic("10 PRINT STR$(5)\n20 PRINT STR$(-5)\n30 END");
    expect(rt.output).toBe(" 5\n-5\n");
  });

  it("VAL parses a leading numeric prefix, ignoring surrounding whitespace and trailing junk", async () => {
    const rt = await runBasic('10 PRINT VAL("  42.5xyz")\n20 END');
    expect(rt.output).toBe(" 42.5 \n");
  });

  it("VAL on malformed input (no leading digits) returns 0", async () => {
    const rt = await runBasic('10 PRINT VAL("nope")\n20 END');
    expect(rt.output).toBe(" 0 \n");
  });

  it("INSTR finds a substring's 1-indexed position, or 0 if not found", async () => {
    const rt = await runBasic(
      '10 PRINT INSTR("HELLO WORLD", "WORLD")\n20 PRINT INSTR("HELLO WORLD", "ZZZ")\n30 END',
    );
    expect(rt.output).toBe(" 7 \n 0 \n");
  });

  it("INSTR with an explicit start argument searches from that position", async () => {
    const rt = await runBasic('10 PRINT INSTR(3, "AAAA", "A")\n20 END');
    expect(rt.output).toBe(" 3 \n");
  });
});

describe("emit — math builtins", () => {
  it("INT floors (distinct from %-suffix rounding)", async () => {
    const rt = await runBasic("10 PRINT INT(3.7)\n20 PRINT INT(-3.7)\n30 END");
    expect(rt.output).toBe(" 3 \n-4 \n");
  });

  it("ABS/SQR/SGN compute their usual math results", async () => {
    const rt = await runBasic(
      "10 PRINT ABS(-5)\n20 PRINT SQR(16)\n30 PRINT SGN(-3)\n40 PRINT SGN(0)\n50 PRINT SGN(3)\n60 END",
    );
    expect(rt.output).toBe(" 5 \n 4 \n-1 \n 0 \n 1 \n");
  });

  it("SQR of a negative number is a runtime error", async () => {
    const rt = await runBasic("10 PRINT SQR(-1)\n20 END");
    expect(rt.errors).toHaveLength(1);
    expect(rt.errors[0]?.message).toMatch(/SQR of a negative number/);
  });

  it("SIN/COS/TAN compute their usual trig results", async () => {
    const rt = await runBasic("10 PRINT SIN(0)\n20 PRINT COS(0)\n30 PRINT TAN(0)\n40 END");
    expect(rt.output).toBe(" 0 \n 1 \n 0 \n");
  });
});

describe("emit — RND/RANDOMIZE", () => {
  it("RANDOMIZE with the same seed produces the same RND sequence", async () => {
    const program = "10 RANDOMIZE 7\n20 PRINT RND(1)\n30 PRINT RND(1)\n40 END";
    const first = await runBasic(program);
    const second = await runBasic(program);
    expect(first.output).toBe(second.output);
  });

  it("RANDOMIZE with different seeds produces different RND sequences", async () => {
    const a = await runBasic("10 RANDOMIZE 1\n20 PRINT RND(1)\n30 END");
    const b = await runBasic("10 RANDOMIZE 2\n20 PRINT RND(1)\n30 END");
    expect(a.output).not.toBe(b.output);
  });

  it("RND produces a value in [0, 1)", async () => {
    const rt = await runBasic(
      "10 RANDOMIZE 1\n20 LET X = RND(1)\n30 PRINT X >= 0 AND X < 1\n40 END",
    );
    expect(rt.output).toBe("-1 \n"); // BASIC TRUE
  });
});

describe("emit — PRINT TAB()/SPC()", () => {
  it("TAB(col) pads to the given column", async () => {
    const rt = await runBasic('10 PRINT "A"; TAB(10); "B"\n20 END');
    expect(rt.output).toBe("A        B\n");
    expect(rt.output.indexOf("B")).toBe(9); // column 10, 0-indexed
  });

  it("TAB(col) contributes nothing if already at/past that column", async () => {
    const rt = await runBasic('10 PRINT "HELLO WORLD"; TAB(3); "X"\n20 END');
    expect(rt.output).toBe("HELLO WORLDX\n");
  });

  it("SPC(n) always contributes exactly n spaces", async () => {
    const rt = await runBasic('10 PRINT "X"; SPC(3); "Y"\n20 END');
    expect(rt.output).toBe("X   Y\n");
  });
});

describe("emit — builtin/array name interaction", () => {
  it("a non-builtin identifier still works as an array, unaffected by the builtin registry", async () => {
    const rt = await runBasic(
      '10 DIM CUSTOM(5)\n20 CUSTOM(2) = 99\n30 PRINT CUSTOM(2)\n40 PRINT LEN("HI")\n50 END',
    );
    expect(rt.output).toBe(" 99 \n 2 \n");
  });
});

describe("emit — type-suffix coercion (%/$ at assignment time)", () => {
  it("rounds a %-suffixed LET target half-away-from-zero", async () => {
    const rt = await runBasic("10 A% = 2.5\n20 PRINT A%\n30 B% = -2.5\n40 PRINT B%\n50 END");
    expect(rt.output).toBe(" 3 \n-3 \n");
  });

  it("allows a %-suffixed value at the exact overflow boundary", async () => {
    const rt = await runBasic("10 A% = 32767\n20 PRINT A%\n30 B% = -32768\n40 PRINT B%\n50 END");
    expect(rt.output).toBe(" 32767 \n-32768 \n");
  });

  it("raises OVERFLOW just past the boundary, on both ends", async () => {
    const high = await runBasic("10 A% = 32768\n20 END");
    expect(high.errors).toHaveLength(1);
    expect(high.errors[0]?.message).toMatch(/OVERFLOW/);

    const low = await runBasic("10 A% = -32769\n20 END");
    expect(low.errors).toHaveLength(1);
    expect(low.errors[0]?.message).toMatch(/OVERFLOW/);
  });

  it("applies the same overflow check to a %-suffixed array element", async () => {
    const rt = await runBasic("10 DIM A%(3)\n20 A%(1) = 99999\n30 END");
    expect(rt.errors).toHaveLength(1);
    expect(rt.errors[0]?.message).toMatch(/OVERFLOW/);
  });

  it("re-coerces a %-suffixed FOR loop variable on every NEXT increment", async () => {
    const rt = await runBasic("10 FOR I% = 1 TO 3 STEP 0.5\n20 PRINT I%\n30 NEXT I%\n40 END");
    // 1 -> 1.5 rounds to 2 -> 2.5 rounds to 3 -> 3.5 rounds to 4, exceeds 3, loop ends.
    expect(rt.output).toBe(" 1 \n 2 \n 3 \n");
  });

  it("applies the overflow check to a %-suffixed INPUT target", async () => {
    const rt = await runBasic("10 INPUT X%\n20 PRINT X%\n30 END", ["40000"]);
    expect(rt.errors).toHaveLength(1);
    expect(rt.errors[0]?.message).toMatch(/OVERFLOW/);
  });

  it("rounds a %-suffixed READ target from a fractional DATA value", async () => {
    const rt = await runBasic("10 DATA 2.5\n20 READ A%\n30 PRINT A%\n40 END");
    expect(rt.output).toBe(" 3 \n");
  });

  it("raises a runtime TYPE MISMATCH for a $-suffixed READ target given numeric DATA", async () => {
    // Not caught at compile time (READ's source values aren't statically
    // correlated with targets — see semantics/analyzer.ts) but still
    // caught at runtime, unlike LET's equivalent case (which is instead a
    // compile-time SemanticError, since LET's source type is always
    // statically known).
    const rt = await runBasic("10 DATA 5\n20 READ A$\n30 END");
    expect(rt.errors).toHaveLength(1);
    expect(rt.errors[0]?.message).toMatch(/TYPE MISMATCH/);
  });

  it("does not affect !/#/no-suffix targets (plain number passthrough)", async () => {
    const rt = await runBasic("10 A = 2.5\n20 PRINT A\n30 B# = 2.5\n40 PRINT B#\n50 END");
    expect(rt.output).toBe(" 2.5 \n 2.5 \n");
  });
});
