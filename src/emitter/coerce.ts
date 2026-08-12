// Wraps an already-emitted value expression's JS text with the runtime
// coercion call appropriate to an assignment target's type suffix (build
// order step 15) — shared by every assignment-time emission site
// (emit-statements.ts's Let/For cases, emit-read.ts's Read case). `!`/`#`/
// no-suffix targets need no wrapping at all: they're JS `number`
// passthroughs (see values.ts's header comment), so only `%` (round +
// overflow-check, via prelude.ts's `__toInt`) and `$` (type-check, via
// `__toStr`) actually wrap anything.
//
// NOT used by emit-input.ts: INPUT already has its own suffix-aware
// coercion (`__inputCoerce`) that also handles the raw-string-to-number
// parse step no other assignment site needs — see its own file.

import type { TypeSuffix } from "../ast/types.js";

export function coerceForSuffix(suffix: TypeSuffix, valueJs: string): string {
  switch (suffix) {
    case "%":
      return `__toInt(${valueJs})`;
    case "$":
      return `__toStr(${valueJs})`;
    case "!":
    case "#":
    case "":
      return valueJs;
  }
}
