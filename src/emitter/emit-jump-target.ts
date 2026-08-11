// JumpTarget -> JS expression text, shared by Goto and If step emission.

import type { JumpTarget } from "../ir/program.js";
import { assertNever } from "../util/assert-never.js";

export function emitJumpTarget(target: JumpTarget): string {
  switch (target.kind) {
    case "line":
      // LINESTART resolves the raw BASIC line number to a step index at
      // runtime — see emit-program.ts, which emits the table. An
      // undefined-line-target jump currently produces `pc = undefined`,
      // which matches no switch case and hits the default (halt) branch —
      // a graceful-enough fallback until step 16 adds compile-time
      // undefined-line-target validation.
      return `LINESTART[${target.line}]`;

    case "step":
      return String(target.index);

    case "halt":
      return "-1";

    default:
      return assertNever(target, "emitJumpTarget");
  }
}
