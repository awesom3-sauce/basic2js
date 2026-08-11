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
