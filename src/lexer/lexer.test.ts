import { describe, expect, it } from "vitest";
import { tokenize } from "./lexer.js";
import { LexError } from "./lex-error.js";
import type { Token } from "./token.js";

/** Strips line/col so test expectations stay readable. */
function shapes(tokens: Token[]): Array<Pick<Token, "type" | "text" | "value">> {
  return tokens.map(({ type, text, value }) => ({ type, text, value }));
}

describe("tokenize", () => {
  it("tokenizes a line number followed by PRINT and a string literal", () => {
    expect(shapes(tokenize('10 PRINT "HELLO"'))).toEqual([
      { type: "LineNumber", text: "10", value: 10 },
      { type: "Keyword", text: "PRINT", value: undefined },
      { type: "String", text: "HELLO", value: "HELLO" },
      { type: "EOL", text: "", value: undefined },
      { type: "EOF", text: "", value: undefined },
    ]);
  });

  it("preserves string literal case while normalizing keywords/identifiers", () => {
    const tokens = tokenize('10 Print "Hello World"');
    expect(tokens[1]).toMatchObject({ type: "Keyword", text: "PRINT" });
    expect(tokens[2]).toMatchObject({ type: "String", text: "Hello World" });
  });

  it("tokenizes LET assignment with an implicit-precision identifier", () => {
    expect(shapes(tokenize("20 LET A = 5"))).toEqual([
      { type: "LineNumber", text: "20", value: 20 },
      { type: "Keyword", text: "LET", value: undefined },
      { type: "Identifier", text: "a", value: "a" },
      { type: "Operator", text: "=", value: undefined },
      { type: "Number", text: "5", value: 5 },
      { type: "EOL", text: "", value: undefined },
      { type: "EOF", text: "", value: undefined },
    ]);
  });

  it("normalizes identifiers/keywords case-insensitively", () => {
    const tokens = tokenize("10 Print A");
    expect(tokens[1]).toMatchObject({ type: "Keyword", text: "PRINT" });
    expect(tokens[2]).toMatchObject({ type: "Identifier", text: "a" });
  });

  it("tokenizes GOTO with a numeric line-number target", () => {
    expect(shapes(tokenize("30 GOTO 10"))).toEqual([
      { type: "LineNumber", text: "30", value: 30 },
      { type: "Keyword", text: "GOTO", value: undefined },
      { type: "Number", text: "10", value: 10 },
      { type: "EOL", text: "", value: undefined },
      { type: "EOF", text: "", value: undefined },
    ]);
  });

  it("keeps type-suffixed identifiers distinct from their unsuffixed name", () => {
    const tokens = tokenize("40 A% = A% + 1");
    expect(shapes(tokens).slice(0, -2)).toEqual([
      { type: "LineNumber", text: "40", value: 40 },
      { type: "Identifier", text: "a%", value: "a%" },
      { type: "Operator", text: "=", value: undefined },
      { type: "Identifier", text: "a%", value: "a%" },
      { type: "Operator", text: "+", value: undefined },
      { type: "Number", text: "1", value: 1 },
    ]);
  });

  it("tokenizes all arithmetic operators, including integer-division and exponent", () => {
    const tokens = tokenize("50 X = 1 + 2 - 3 * 4 / 5 \\ 6 ^ 2");
    const ops = tokens.filter((t) => t.type === "Operator").map((t) => t.text);
    expect(ops).toEqual(["=", "+", "-", "*", "/", "\\", "^"]);
  });

  it("tokenizes decimal number literals, including a leading-dot form", () => {
    const tokens = tokenize("60 X = 3.14 + .5");
    const numbers = tokens.filter((t) => t.type === "Number");
    expect(numbers).toEqual([
      expect.objectContaining({ text: "3.14", value: 3.14 }),
      expect.objectContaining({ text: ".5", value: 0.5 }),
    ]);
  });

  it("tokenizes two-character comparison operators distinctly from single-char ones", () => {
    const tokens = tokenize("70 X = A <= B");
    expect(tokens.map((t) => t.text)).toContain("<=");

    const tokens2 = tokenize("80 X = A <> B");
    expect(tokens2.map((t) => t.text)).toContain("<>");

    const tokens3 = tokenize("90 X = A >= B");
    expect(tokens3.map((t) => t.text)).toContain(">=");

    const tokens4 = tokenize("95 X = A < B");
    const opTexts = tokens4.filter((t) => t.type === "Operator").map((t) => t.text);
    expect(opTexts).toEqual(["=", "<"]);
  });

  it("splits colon-separated statements into Colon tokens", () => {
    const tokens = tokenize("100 A = 1: B = 2: PRINT A");
    const colonCount = tokens.filter((t) => t.type === "Colon").length;
    expect(colonCount).toBe(2);
  });

  it("treats REM as a Comment token, not a Keyword, and consumes to end of line", () => {
    expect(shapes(tokenize("110 REM this is a comment"))).toEqual([
      { type: "LineNumber", text: "110", value: 110 },
      { type: "Comment", text: "this is a comment", value: "this is a comment" },
      { type: "EOL", text: "", value: undefined },
      { type: "EOF", text: "", value: undefined },
    ]);
  });

  it("treats a bare apostrophe as a shorthand comment", () => {
    const tokens = tokenize("120 X = 1 'trailing comment");
    const comment = tokens.find((t) => t.type === "Comment");
    expect(comment).toMatchObject({ text: "trailing comment" });
    // Nothing should be tokenized after the comment starts.
    expect(tokens.map((t) => t.type)).toEqual([
      "LineNumber",
      "Identifier",
      "Operator",
      "Number",
      "Comment",
      "EOL",
      "EOF",
    ]);
  });

  it("skips blank lines without emitting tokens for them", () => {
    const tokens = tokenize("200 PRINT 1\n\n210 PRINT 2");
    expect(tokens.map((t) => t.type)).toEqual([
      "LineNumber",
      "Keyword",
      "Number",
      "EOL",
      "LineNumber",
      "Keyword",
      "Number",
      "EOL",
      "EOF",
    ]);
  });

  it("always ends the token stream with a single EOF token", () => {
    const tokens = tokenize("10 PRINT 1");
    expect(tokens.at(-1)).toMatchObject({ type: "EOF" });
    expect(tokens.filter((t) => t.type === "EOF")).toHaveLength(1);
  });

  it("throws LexError when a non-blank line has no leading line number", () => {
    expect(() => tokenize("PRINT 1")).toThrow(LexError);
  });

  it("throws LexError on an unterminated string literal", () => {
    expect(() => tokenize('10 PRINT "hello')).toThrow(LexError);
  });

  it("throws LexError on an unrecognized character", () => {
    expect(() => tokenize("10 PRINT @")).toThrow(LexError);
  });
});
