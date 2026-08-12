import { describe, expect, it } from "vitest";
import { SemanticError } from "./semantic-error.js";
import type { Diagnostic } from "./diagnostic.js";

describe("SemanticError", () => {
  it("formats a single diagnostic into its message", () => {
    const diagnostics: Diagnostic[] = [{ code: "TYPE_MISMATCH", message: "bad thing", line: 10 }];
    const error = new SemanticError(diagnostics);
    expect(error.message).toBe("line 10: bad thing [TYPE_MISMATCH]");
    expect(error.name).toBe("SemanticError");
    expect(error.diagnostics).toBe(diagnostics);
  });

  it("formats multiple diagnostics, one per line", () => {
    const diagnostics: Diagnostic[] = [
      { code: "TYPE_MISMATCH", message: "first", line: 10 },
      { code: "TYPE_MISMATCH", message: "second", line: 20 },
    ];
    const error = new SemanticError(diagnostics);
    expect(error.message).toBe("line 10: first [TYPE_MISMATCH]\nline 20: second [TYPE_MISMATCH]");
  });
});
