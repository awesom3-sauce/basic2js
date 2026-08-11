import { describe, expect, it } from "vitest";
import { tokenize } from "../lexer/lexer.js";
import { parse } from "./parser.js";
import { ParseError } from "./errors.js";
import type { Program } from "../ast/program.js";
import type { Expression } from "../ast/expressions.js";
import type { LetStmt } from "../ast/statements.js";

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
      { kind: "PrintStmt", segments: [{ kind: "value", expr: { kind: "NumberLiteral", value: 1 } }] },
      { kind: "RemStmt", text: "note" },
    ]);
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

describe("parse — not-yet-implemented statements", () => {
  it("raises a clear error for a keyword without parser support yet", () => {
    expect(() => parseSource("10 IF 1 THEN 20")).toThrow(ParseError);
    expect(() => parseSource("10 IF 1 THEN 20")).toThrow(/not implemented yet/);
  });
});
