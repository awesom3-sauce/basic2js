// Splits a lexer-normalized identifier token's text (already lowercased,
// e.g. "a%", "count$", "x") into its bare name and type suffix. Shared by
// expression parsing (VariableRef/ArrayRef) and statement parsing
// (LValue, FOR-loop variable, DEF FN params, ...).

import type { TypeSuffix } from "../ast/types.js";

const SUFFIX_CHARS = new Set(["%", "!", "#", "$"]);

export function splitSuffix(identifierText: string): { name: string; suffix: TypeSuffix } {
  const last = identifierText.charAt(identifierText.length - 1);
  if (SUFFIX_CHARS.has(last)) {
    return { name: identifierText.slice(0, -1), suffix: last as TypeSuffix };
  }
  return { name: identifierText, suffix: "" };
}
