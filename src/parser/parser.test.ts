import { describe, expect, it } from "vitest";
import { tokenize } from "../lexer/lexer.js";
import { parse } from "./parser.js";
import { ParseError } from "./errors.js";
import type { Program } from "../ast/program.js";
import type { Expression } from "../ast/expressions.js";
import type { IfStmt, LetStmt } from "../ast/statements.js";

function parseSource(source: string): Program {
  return parse(tokenize(source));
}

/** Convenience for tests that only care about one line's statements. */
function firstLineStatements(source: string) {
  const program = parseSource(source);
  expect(program.lines).toHaveLength(1);
  return program.lines[0]!.statements;
}

function firstStatement(source: string) {
  const statements = firstLineStatements(source);
  expect(statements).toHaveLength(1);
  return statements[0]!;
}

function letValue(source: string): Expression {
  const stmt = firstStatement(source) as LetStmt;
  expect(stmt.kind).toBe("LetStmt");
  return stmt.value;
}

describe("parse — PRINT", () => {
  it("parses a single string literal argument", () => {
    const stmt = firstStatement('10 PRINT "HELLO"');
    expect(stmt).toEqual({
      kind: "PrintStmt",
      segments: [{ kind: "value", expr: { kind: "StringLiteral", value: "HELLO" } }],
    });
  });

  it("parses ; and , separated arguments", () => {
    const stmt = firstStatement("20 PRINT 1;2,3");
    expect(stmt).toEqual({
      kind: "PrintStmt",
      segments: [
        { kind: "value", expr: { kind: "NumberLiteral", value: 1 } },
        { kind: "sep", sep: ";" },
        { kind: "value", expr: { kind: "NumberLiteral", value: 2 } },
        { kind: "sep", sep: "," },
        { kind: "value", expr: { kind: "NumberLiteral", value: 3 } },
      ],
    });
  });

  it("parses a bare PRINT with no arguments", () => {
    const stmt = firstStatement("30 PRINT");
    expect(stmt).toEqual({ kind: "PrintStmt", segments: [] });
  });

  it("stops at a trailing comment with no separator required", () => {
    const statements = firstLineStatements("40 PRINT 1 'note");
    expect(statements).toEqual([
      {
        kind: "PrintStmt",
        segments: [{ kind: "value", expr: { kind: "NumberLiteral", value: 1 } }],
      },
      { kind: "RemStmt", text: "note" },
    ]);
  });

  it("rejects two values with no separator between them", () => {
    expect(() => parseSource("50 PRINT 1 2")).toThrow(ParseError);
    expect(() => parseSource("50 PRINT 1 2")).toThrow(/Expected ";" or ","/);
  });
});

describe("parse — LET / assignment", () => {
  it("parses explicit LET", () => {
    const stmt = firstStatement("10 LET A = 5");
    expect(stmt).toEqual({
      kind: "LetStmt",
      target: { kind: "Variable", name: "a", suffix: "" },
      value: { kind: "NumberLiteral", value: 5 },
      explicitLet: true,
    });
  });

  it("parses implicit assignment without LET", () => {
    const stmt = firstStatement("10 A = 5") as LetStmt;
    expect(stmt.explicitLet).toBe(false);
    expect(stmt.target).toEqual({ kind: "Variable", name: "a", suffix: "" });
  });

  it("preserves the variable's type suffix", () => {
    const stmt = firstStatement("10 A% = 1") as LetStmt;
    expect(stmt.target).toEqual({ kind: "Variable", name: "a", suffix: "%" });
  });

  it("rejects a bare expression that isn't an assignment", () => {
    expect(() => parseSource("10 A + 1")).toThrow(ParseError);
  });
});

describe("parse — arithmetic expressions", () => {
  it("gives * higher precedence than +", () => {
    expect(letValue("10 LET A = 1 + 2 * 3")).toEqual({
      kind: "BinaryExpr",
      op: "+",
      left: { kind: "NumberLiteral", value: 1 },
      right: {
        kind: "BinaryExpr",
        op: "*",
        left: { kind: "NumberLiteral", value: 2 },
        right: { kind: "NumberLiteral", value: 3 },
      },
    });
  });

  it("respects parenthesized grouping", () => {
    expect(letValue("10 LET A = (1 + 2) * 3")).toEqual({
      kind: "BinaryExpr",
      op: "*",
      left: {
        kind: "BinaryExpr",
        op: "+",
        left: { kind: "NumberLiteral", value: 1 },
        right: { kind: "NumberLiteral", value: 2 },
      },
      right: { kind: "NumberLiteral", value: 3 },
    });
  });

  it("makes ^ right-associative", () => {
    // 2 ^ 3 ^ 2 should parse as 2 ^ (3 ^ 2), not (2 ^ 3) ^ 2.
    expect(letValue("10 LET A = 2 ^ 3 ^ 2")).toEqual({
      kind: "BinaryExpr",
      op: "^",
      left: { kind: "NumberLiteral", value: 2 },
      right: {
        kind: "BinaryExpr",
        op: "^",
        left: { kind: "NumberLiteral", value: 3 },
        right: { kind: "NumberLiteral", value: 2 },
      },
    });
  });

  it("binds unary minus looser than ^ (-2^2 is -(2^2))", () => {
    expect(letValue("10 LET A = -2 ^ 2")).toEqual({
      kind: "UnaryExpr",
      op: "-",
      operand: {
        kind: "BinaryExpr",
        op: "^",
        left: { kind: "NumberLiteral", value: 2 },
        right: { kind: "NumberLiteral", value: 2 },
      },
    });
  });

  it("binds unary minus tighter than * (-2*3 is (-2)*3)", () => {
    expect(letValue("10 LET A = -2 * 3")).toEqual({
      kind: "BinaryExpr",
      op: "*",
      left: { kind: "UnaryExpr", op: "-", operand: { kind: "NumberLiteral", value: 2 } },
      right: { kind: "NumberLiteral", value: 3 },
    });
  });

  it("parses integer division and MOD", () => {
    expect(letValue("10 LET A = 7 \\ 2")).toEqual({
      kind: "BinaryExpr",
      op: "\\",
      left: { kind: "NumberLiteral", value: 7 },
      right: { kind: "NumberLiteral", value: 2 },
    });
    expect(letValue("10 LET A = 7 MOD 2")).toEqual({
      kind: "BinaryExpr",
      op: "MOD",
      left: { kind: "NumberLiteral", value: 7 },
      right: { kind: "NumberLiteral", value: 2 },
    });
  });

  it("parses variable references with a type suffix", () => {
    expect(letValue("10 LET A = B$")).toEqual({
      kind: "VariableRef",
      name: "b",
      suffix: "$",
    });
  });
});

describe("parse — GOTO", () => {
  it("parses a line-number target", () => {
    const stmt = firstStatement("10 GOTO 20");
    expect(stmt).toEqual({ kind: "GotoStmt", target: 20 });
  });

  it("rejects a non-numeric target", () => {
    expect(() => parseSource("10 GOTO A")).toThrow(ParseError);
  });
});

describe("parse — REM / comments", () => {
  it("parses a REM statement", () => {
    const stmt = firstStatement("10 REM this is a comment");
    expect(stmt).toEqual({ kind: "RemStmt", text: "this is a comment" });
  });

  it("parses an apostrophe comment", () => {
    const stmt = firstStatement("10 'this is a comment");
    expect(stmt).toEqual({ kind: "RemStmt", text: "this is a comment" });
  });

  it("parses REM after a colon-separated statement", () => {
    const statements = firstLineStatements("10 X = 1: REM note");
    expect(statements).toEqual([
      {
        kind: "LetStmt",
        target: { kind: "Variable", name: "x", suffix: "" },
        value: { kind: "NumberLiteral", value: 1 },
        explicitLet: false,
      },
      { kind: "RemStmt", text: "note" },
    ]);
  });
});

describe("parse — END / STOP", () => {
  it("parses END and STOP", () => {
    expect(firstStatement("10 END")).toEqual({ kind: "EndStmt" });
    expect(firstStatement("10 STOP")).toEqual({ kind: "StopStmt" });
  });
});

describe("parse — lines and program structure", () => {
  it("parses colon-separated statements on one line", () => {
    const statements = firstLineStatements("10 A = 1: B = 2: PRINT A");
    expect(statements).toHaveLength(3);
    expect(statements.map((s) => s.kind)).toEqual(["LetStmt", "LetStmt", "PrintStmt"]);
  });

  it("allows a line with only a line number and no statements", () => {
    const statements = firstLineStatements("100");
    expect(statements).toEqual([]);
  });

  it("sorts lines by line number regardless of source order", () => {
    const program = parseSource("20 PRINT 2\n10 PRINT 1");
    expect(program.lines.map((l) => l.lineNumber)).toEqual([10, 20]);
  });

  it("rejects duplicate line numbers", () => {
    expect(() => parseSource("10 PRINT 1\n10 PRINT 2")).toThrow(ParseError);
  });
});

// All 20 Statement kinds are implemented as of build order step 13 (DEF
// FN was the last one) — there's no longer a real BASIC keyword left to
// exercise parseStatement's "not implemented yet" fallback branch with.

describe("parse — FOR/NEXT", () => {
  it("parses FOR with no STEP (defaults handled at lowering, not parsing)", () => {
    const stmt = firstStatement("10 FOR I = 1 TO 10");
    expect(stmt).toEqual({
      kind: "ForStmt",
      variable: "i",
      suffix: "",
      start: { kind: "NumberLiteral", value: 1 },
      end: { kind: "NumberLiteral", value: 10 },
      step: undefined,
    });
  });

  it("parses FOR with an explicit STEP", () => {
    const stmt = firstStatement("10 FOR I% = 10 TO 1 STEP -1");
    expect(stmt).toEqual({
      kind: "ForStmt",
      variable: "i",
      suffix: "%",
      start: { kind: "NumberLiteral", value: 10 },
      end: { kind: "NumberLiteral", value: 1 },
      step: { kind: "UnaryExpr", op: "-", operand: { kind: "NumberLiteral", value: 1 } },
    });
  });

  it("parses a bare NEXT", () => {
    expect(firstStatement("10 NEXT")).toEqual({ kind: "NextStmt", variables: [] });
  });

  it("parses NEXT with a single variable", () => {
    expect(firstStatement("10 NEXT I")).toEqual({ kind: "NextStmt", variables: ["i"] });
  });

  it("parses NEXT with multiple variables", () => {
    expect(firstStatement("10 NEXT I, J")).toEqual({ kind: "NextStmt", variables: ["i", "j"] });
  });
});

describe("parse — IF/THEN/ELSE", () => {
  it("parses a bare IF/THEN <line> with no ELSE", () => {
    const stmt = firstStatement("10 IF X = 1 THEN 100");
    expect(stmt).toEqual({
      kind: "IfStmt",
      condition: {
        kind: "BinaryExpr",
        op: "=",
        left: { kind: "VariableRef", name: "x", suffix: "" },
        right: { kind: "NumberLiteral", value: 1 },
      },
      thenBranch: { kind: "GotoLine", lineNumber: 100 },
      elseBranch: undefined,
    });
  });

  it("parses IF/THEN <line> ELSE <line>", () => {
    const stmt = firstStatement("10 IF X THEN 100 ELSE 200");
    expect(stmt).toEqual({
      kind: "IfStmt",
      condition: { kind: "VariableRef", name: "x", suffix: "" },
      thenBranch: { kind: "GotoLine", lineNumber: 100 },
      elseBranch: { kind: "GotoLine", lineNumber: 200 },
    });
  });

  it("parses an inline THEN statement list extending to end of line, ignoring colons as terminators", () => {
    const statements = firstLineStatements('10 IF X THEN PRINT "A": PRINT "B"');
    expect(statements).toHaveLength(1);
    const ifStmt = statements[0] as IfStmt;
    expect(ifStmt.thenBranch).toEqual({
      kind: "Statements",
      statements: [
        {
          kind: "PrintStmt",
          segments: [{ kind: "value", expr: { kind: "StringLiteral", value: "A" } }],
        },
        {
          kind: "PrintStmt",
          segments: [{ kind: "value", expr: { kind: "StringLiteral", value: "B" } }],
        },
      ],
    });
  });

  it("parses an inline THEN ... ELSE ... where PRINT correctly stops before ELSE", () => {
    const stmt = firstStatement('10 IF X THEN PRINT "A" ELSE PRINT "B"') as IfStmt;
    expect(stmt.thenBranch).toEqual({
      kind: "Statements",
      statements: [
        {
          kind: "PrintStmt",
          segments: [{ kind: "value", expr: { kind: "StringLiteral", value: "A" } }],
        },
      ],
    });
    expect(stmt.elseBranch).toEqual({
      kind: "Statements",
      statements: [
        {
          kind: "PrintStmt",
          segments: [{ kind: "value", expr: { kind: "StringLiteral", value: "B" } }],
        },
      ],
    });
  });

  it("supports nested IF inside a THEN branch", () => {
    const stmt = firstStatement("10 IF X THEN IF Y THEN 100") as IfStmt;
    expect(stmt.thenBranch).toEqual({
      kind: "Statements",
      statements: [
        {
          kind: "IfStmt",
          condition: { kind: "VariableRef", name: "y", suffix: "" },
          thenBranch: { kind: "GotoLine", lineNumber: 100 },
          elseBranch: undefined,
        },
      ],
    });
  });
});

describe("parse — comparisons and logical operators", () => {
  it("parses comparison operators", () => {
    expect(letValue("10 LET A = 1 = 2")).toEqual({
      kind: "BinaryExpr",
      op: "=",
      left: { kind: "NumberLiteral", value: 1 },
      right: { kind: "NumberLiteral", value: 2 },
    });
    expect((letValue("10 LET A = 1 <> 2") as { op: string }).op).toBe("<>");
    expect((letValue("10 LET A = 1 <= 2") as { op: string }).op).toBe("<=");
    expect((letValue("10 LET A = 1 >= 2") as { op: string }).op).toBe(">=");
  });

  it("gives arithmetic higher precedence than comparisons", () => {
    // 1 + 2 = 3 should parse as (1 + 2) = 3, not 1 + (2 = 3).
    expect(letValue("10 LET A = 1 + 2 = 3")).toEqual({
      kind: "BinaryExpr",
      op: "=",
      left: {
        kind: "BinaryExpr",
        op: "+",
        left: { kind: "NumberLiteral", value: 1 },
        right: { kind: "NumberLiteral", value: 2 },
      },
      right: { kind: "NumberLiteral", value: 3 },
    });
  });

  it("gives comparisons higher precedence than AND/OR", () => {
    // A > 1 AND B > 2 should parse as (A > 1) AND (B > 2).
    expect(letValue("10 LET Z = A > 1 AND B > 2")).toEqual({
      kind: "BinaryExpr",
      op: "AND",
      left: {
        kind: "BinaryExpr",
        op: ">",
        left: { kind: "VariableRef", name: "a", suffix: "" },
        right: { kind: "NumberLiteral", value: 1 },
      },
      right: {
        kind: "BinaryExpr",
        op: ">",
        left: { kind: "VariableRef", name: "b", suffix: "" },
        right: { kind: "NumberLiteral", value: 2 },
      },
    });
  });

  it("gives AND higher precedence than OR", () => {
    // A AND B OR C should parse as (A AND B) OR C.
    expect(letValue("10 LET Z = A AND B OR C")).toEqual({
      kind: "BinaryExpr",
      op: "OR",
      left: {
        kind: "BinaryExpr",
        op: "AND",
        left: { kind: "VariableRef", name: "a", suffix: "" },
        right: { kind: "VariableRef", name: "b", suffix: "" },
      },
      right: { kind: "VariableRef", name: "c", suffix: "" },
    });
  });

  it("parses NOT with higher precedence than AND but lower than comparisons", () => {
    // NOT A > B AND C should parse as (NOT (A > B)) AND C.
    expect(letValue("10 LET Z = NOT A > B AND C")).toEqual({
      kind: "BinaryExpr",
      op: "AND",
      left: {
        kind: "UnaryExpr",
        op: "NOT",
        operand: {
          kind: "BinaryExpr",
          op: ">",
          left: { kind: "VariableRef", name: "a", suffix: "" },
          right: { kind: "VariableRef", name: "b", suffix: "" },
        },
      },
      right: { kind: "VariableRef", name: "c", suffix: "" },
    });
  });
});

describe("parse — GOSUB/RETURN/ON", () => {
  it("parses GOSUB with a line-number target", () => {
    expect(firstStatement("10 GOSUB 100")).toEqual({ kind: "GosubStmt", target: 100 });
  });

  it("parses RETURN", () => {
    expect(firstStatement("10 RETURN")).toEqual({ kind: "ReturnStmt" });
  });

  it("parses ON <expr> GOTO with multiple targets", () => {
    expect(firstStatement("10 ON N GOTO 100, 200, 300")).toEqual({
      kind: "OnJumpStmt",
      mode: "goto",
      selector: { kind: "VariableRef", name: "n", suffix: "" },
      targets: [100, 200, 300],
    });
  });

  it("parses ON <expr> GOSUB with multiple targets", () => {
    expect(firstStatement("10 ON N GOSUB 100, 200")).toEqual({
      kind: "OnJumpStmt",
      mode: "gosub",
      selector: { kind: "VariableRef", name: "n", suffix: "" },
      targets: [100, 200],
    });
  });

  it("rejects ON <expr> without a following GOTO or GOSUB", () => {
    expect(() => parseSource("10 ON N PRINT 1")).toThrow(ParseError);
  });
});

describe("parse — INPUT", () => {
  it("parses a bare INPUT with a single target", () => {
    expect(firstStatement("10 INPUT X")).toEqual({
      kind: "InputStmt",
      prompt: undefined,
      appendQuestionMark: true,
      targets: [{ kind: "Variable", name: "x", suffix: "" }],
    });
  });

  it("parses INPUT with multiple targets", () => {
    expect(firstStatement("10 INPUT A, B$")).toEqual({
      kind: "InputStmt",
      prompt: undefined,
      appendQuestionMark: true,
      targets: [
        { kind: "Variable", name: "a", suffix: "" },
        { kind: "Variable", name: "b", suffix: "$" },
      ],
    });
  });

  it('parses a prompt followed by ";" as appending a question mark', () => {
    const stmt = firstStatement('10 INPUT "Name"; N$');
    expect(stmt).toEqual({
      kind: "InputStmt",
      prompt: "Name",
      appendQuestionMark: true,
      targets: [{ kind: "Variable", name: "n", suffix: "$" }],
    });
  });

  it('parses a prompt followed by "," as suppressing the question mark', () => {
    const stmt = firstStatement('10 INPUT "Name", N$');
    expect(stmt).toEqual({
      kind: "InputStmt",
      prompt: "Name",
      appendQuestionMark: false,
      targets: [{ kind: "Variable", name: "n", suffix: "$" }],
    });
  });
});

describe("parse — DIM / arrays", () => {
  it("parses a single-dimension DIM declaration", () => {
    expect(firstStatement("10 DIM A(10)")).toEqual({
      kind: "DimStmt",
      declarations: [{ name: "a", suffix: "", dimensions: [{ kind: "NumberLiteral", value: 10 }] }],
    });
  });

  it("parses a two-dimension DIM declaration", () => {
    expect(firstStatement("10 DIM B(2, 3)")).toEqual({
      kind: "DimStmt",
      declarations: [
        {
          name: "b",
          suffix: "",
          dimensions: [
            { kind: "NumberLiteral", value: 2 },
            { kind: "NumberLiteral", value: 3 },
          ],
        },
      ],
    });
  });

  it("parses multiple comma-separated DIM declarations", () => {
    expect(firstStatement("10 DIM A(5), B$(10)")).toEqual({
      kind: "DimStmt",
      declarations: [
        { name: "a", suffix: "", dimensions: [{ kind: "NumberLiteral", value: 5 }] },
        { name: "b", suffix: "$", dimensions: [{ kind: "NumberLiteral", value: 10 }] },
      ],
    });
  });

  it("parses an array element as an assignment target", () => {
    const stmt = firstStatement("10 A(1) = 5") as LetStmt;
    expect(stmt.target).toEqual({
      kind: "ArrayElement",
      name: "a",
      suffix: "",
      indices: [{ kind: "NumberLiteral", value: 1 }],
    });
  });

  it("parses an array element as an expression", () => {
    expect(letValue("10 LET X = A(1) + A(2)")).toEqual({
      kind: "BinaryExpr",
      op: "+",
      left: {
        kind: "ArrayRef",
        name: "a",
        suffix: "",
        indices: [{ kind: "NumberLiteral", value: 1 }],
      },
      right: {
        kind: "ArrayRef",
        name: "a",
        suffix: "",
        indices: [{ kind: "NumberLiteral", value: 2 }],
      },
    });
  });

  it("parses a two-dimension array reference", () => {
    expect(letValue("10 LET X = B(I, J)")).toEqual({
      kind: "ArrayRef",
      name: "b",
      suffix: "",
      indices: [
        { kind: "VariableRef", name: "i", suffix: "" },
        { kind: "VariableRef", name: "j", suffix: "" },
      ],
    });
  });
});

describe("parse — DATA/READ/RESTORE", () => {
  it("parses a DATA statement with numbers and quoted strings", () => {
    expect(firstStatement('10 DATA 1, -5, "Alice"')).toEqual({
      kind: "DataStmt",
      values: [
        { t: "num", v: 1 },
        { t: "num", v: -5 },
        { t: "str", v: "Alice" },
      ],
    });
  });

  it("rejects an unquoted bare-word DATA value", () => {
    expect(() => parseSource("10 DATA JOHN")).toThrow(ParseError);
  });

  it("parses READ with multiple targets", () => {
    expect(firstStatement("10 READ A, B$")).toEqual({
      kind: "ReadStmt",
      targets: [
        { kind: "Variable", name: "a", suffix: "" },
        { kind: "Variable", name: "b", suffix: "$" },
      ],
    });
  });

  it("parses a bare RESTORE", () => {
    expect(firstStatement("10 RESTORE")).toEqual({ kind: "RestoreStmt", target: undefined });
  });

  it("parses RESTORE with a line-number target", () => {
    expect(firstStatement("10 RESTORE 100")).toEqual({ kind: "RestoreStmt", target: 100 });
  });
});

describe("parse — WHILE/WEND", () => {
  it("parses WHILE with a condition", () => {
    expect(firstStatement("10 WHILE X < 10")).toEqual({
      kind: "WhileStmt",
      condition: {
        kind: "BinaryExpr",
        op: "<",
        left: { kind: "VariableRef", name: "x", suffix: "" },
        right: { kind: "NumberLiteral", value: 10 },
      },
    });
  });

  it("parses WEND", () => {
    expect(firstStatement("10 WEND")).toEqual({ kind: "WendStmt" });
  });

  it("does not collect the loop body at parse time (unlike IF/FOR)", () => {
    // WHILE/WEND are ordinary standalone statements — the body is
    // whatever comes between them at the top level, matched later at
    // lowering time, not nested inside the AST node itself.
    const statements = firstLineStatements("10 WHILE X < 10");
    expect(statements).toHaveLength(1);
    expect(Object.keys(statements[0]!)).toEqual(["kind", "condition"]);
  });
});

describe("parse — DEF FN", () => {
  it("parses a single-parameter DEF FN", () => {
    expect(firstStatement("10 DEF FN D(X) = X * 2")).toEqual({
      kind: "DefFnStmt",
      name: "d",
      suffix: "",
      params: [{ name: "x", suffix: "" }],
      body: {
        kind: "BinaryExpr",
        op: "*",
        left: { kind: "VariableRef", name: "x", suffix: "" },
        right: { kind: "NumberLiteral", value: 2 },
      },
    });
  });

  it("parses a zero-parameter DEF FN", () => {
    expect(firstStatement("10 DEF FN PI() = 3.14159")).toEqual({
      kind: "DefFnStmt",
      name: "pi",
      suffix: "",
      params: [],
      body: { kind: "NumberLiteral", value: 3.14159 },
    });
  });

  it("parses a multi-parameter DEF FN and a suffixed function name", () => {
    expect(firstStatement("10 DEF FN SUM%(A, B) = A + B")).toEqual({
      kind: "DefFnStmt",
      name: "sum",
      suffix: "%",
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

  it("rejects the concatenated FNA(X) form — a space between FN and the name is required", () => {
    // See parse-statements.ts's parseDefFnStmt doc comment: without the
    // space, "FNA" lexes as one Identifier token, not a Keyword("FN")
    // followed by an Identifier, which parseDefFnStmt requires.
    expect(() => parseSource("10 DEF FNA(X) = X * 2")).toThrow(ParseError);
  });

  it("parses an FN call expression", () => {
    expect(letValue("10 LET Y = FN D(5)")).toEqual({
      kind: "CallExpr",
      callee: "d",
      args: [{ kind: "NumberLiteral", value: 5 }],
    });
  });

  it("parses a zero-argument FN call", () => {
    expect(letValue("10 LET Y = FN PI()")).toEqual({
      kind: "CallExpr",
      callee: "pi",
      args: [],
    });
  });

  it("parses nested FN calls", () => {
    expect(letValue("10 LET Y = FN A(FN B(X))")).toEqual({
      kind: "CallExpr",
      callee: "a",
      args: [
        { kind: "CallExpr", callee: "b", args: [{ kind: "VariableRef", name: "x", suffix: "" }] },
      ],
    });
  });
});

describe("parse — builtin function calls", () => {
  it("parses a builtin call as a CallExpr, not an ArrayRef", () => {
    expect(letValue('10 LET Y = LEN("HI")')).toEqual({
      kind: "CallExpr",
      callee: "len",
      args: [{ kind: "StringLiteral", value: "HI" }],
    });
  });

  it("keeps the $ suffix as part of the callee spelling", () => {
    expect(letValue('10 LET Y = LEFT$("HI", 1)')).toEqual({
      kind: "CallExpr",
      callee: "left$",
      args: [
        { kind: "StringLiteral", value: "HI" },
        { kind: "NumberLiteral", value: 1 },
      ],
    });
  });

  it("parses MID$ with the optional length argument omitted", () => {
    expect(letValue('10 LET Y = MID$("HI", 1)')).toEqual({
      kind: "CallExpr",
      callee: "mid$",
      args: [
        { kind: "StringLiteral", value: "HI" },
        { kind: "NumberLiteral", value: 1 },
      ],
    });
  });

  it("parses INSTR with and without the optional leading start argument", () => {
    expect(letValue('10 LET Y = INSTR("HI", "I")')).toEqual({
      kind: "CallExpr",
      callee: "instr",
      args: [
        { kind: "StringLiteral", value: "HI" },
        { kind: "StringLiteral", value: "I" },
      ],
    });
    expect(letValue('10 LET Y = INSTR(2, "HI", "I")')).toEqual({
      kind: "CallExpr",
      callee: "instr",
      args: [
        { kind: "NumberLiteral", value: 2 },
        { kind: "StringLiteral", value: "HI" },
        { kind: "StringLiteral", value: "I" },
      ],
    });
  });

  it("still parses a non-builtin identifier(args) as an ArrayRef", () => {
    expect(letValue("10 LET Y = CUSTOM(1)")).toEqual({
      kind: "ArrayRef",
      name: "custom",
      suffix: "",
      indices: [{ kind: "NumberLiteral", value: 1 }],
    });
  });

  it("rejects a builtin call with too few arguments", () => {
    expect(() => parseSource('10 PRINT LEFT$("X")')).toThrow(/LEFT\$ expects 2 arguments, got 1/);
  });

  it("rejects a builtin call with too many arguments", () => {
    expect(() => parseSource('10 PRINT LEN("X", "Y")')).toThrow(/LEN expects 1 argument, got 2/);
  });

  it("accepts INSTR with either 2 or 3 arguments, rejecting 1 or 4", () => {
    expect(() => parseSource('10 PRINT INSTR("X")')).toThrow(
      /INSTR expects 2 to 3 arguments, got 1/,
    );
    expect(() => parseSource('10 PRINT INSTR(1, "X", "Y", "Z")')).toThrow(
      /INSTR expects 2 to 3 arguments, got 4/,
    );
  });
});

describe("parse — RANDOMIZE", () => {
  it("parses RANDOMIZE with a seed expression", () => {
    expect(firstStatement("10 RANDOMIZE 42")).toEqual({
      kind: "RandomizeStmt",
      seed: { kind: "NumberLiteral", value: 42 },
    });
  });

  it("parses RANDOMIZE with an arbitrary expression seed", () => {
    expect(firstStatement("10 RANDOMIZE T + 1")).toEqual({
      kind: "RandomizeStmt",
      seed: {
        kind: "BinaryExpr",
        op: "+",
        left: { kind: "VariableRef", name: "t", suffix: "" },
        right: { kind: "NumberLiteral", value: 1 },
      },
    });
  });
});

describe("parse — PRINT TAB()/SPC()", () => {
  it("parses TAB(expr) as a tab segment", () => {
    const statements = firstLineStatements('10 PRINT "A"; TAB(10); "B"');
    expect(statements).toEqual([
      {
        kind: "PrintStmt",
        segments: [
          { kind: "value", expr: { kind: "StringLiteral", value: "A" } },
          { kind: "sep", sep: ";" },
          { kind: "tab", expr: { kind: "NumberLiteral", value: 10 } },
          { kind: "sep", sep: ";" },
          { kind: "value", expr: { kind: "StringLiteral", value: "B" } },
        ],
      },
    ]);
  });

  it("parses SPC(expr) as a spc segment", () => {
    const statements = firstLineStatements("10 PRINT SPC(3)");
    expect(statements).toEqual([
      { kind: "PrintStmt", segments: [{ kind: "spc", expr: { kind: "NumberLiteral", value: 3 } }] },
    ]);
  });

  it("treats a bare TAB/SPC with no following ( as an ordinary variable", () => {
    const statements = firstLineStatements("10 PRINT TAB");
    expect(statements).toEqual([
      {
        kind: "PrintStmt",
        segments: [{ kind: "value", expr: { kind: "VariableRef", name: "tab", suffix: "" } }],
      },
    ]);
  });

  it("rejects TAB() with the wrong argument count", () => {
    expect(() => parseSource("10 PRINT TAB(1, 2)")).toThrow(/TAB expects 1 argument, got 2/);
  });
});
