// Small embedded support-library text inlined at the top of every
// generated output.js, so emitted files have zero import dependencies on
// this compiler's own source tree (see CLAUDE.md's runtime host contract).
//
// Started in build order step 4 with PRINT's two formatting helpers (see
// emit-print.ts); grew a helper alongside each control-flow/IO construct
// that needed shared runtime logic since (FOR/NEXT's __nextFor, GOSUB's
// __return and ON...GOTO/GOSUB's __onJumpTarget, INPUT's __inputCoerce).
// Will likely be assembled from src/runtime/shared/*'s logic once the full
// builtin library (step 14) lands, rather than hand-written here. Helper
// names are prefixed with "__" and are never valid BASIC identifiers
// (which live in the V/ARR objects, not as bare JS identifiers — see
// mangle.ts), so they can't collide with user variables. Helpers that need
// closure state living inside run() (V, forStack, gosubStack) take it as
// an explicit parameter, since PRELUDE functions sit outside that closure.

export const PRELUDE = `
function __fmtNum(n) {
  return (n >= 0 ? " " : "") + String(n) + " ";
}
function __tabPad(currentLength) {
  var nextZone = (Math.floor(currentLength / 14) + 1) * 14;
  return " ".repeat(nextZone - currentLength);
}
function __nextFor(V, forStack, variable, fallthroughPc) {
  var frame;
  for (;;) {
    frame = forStack.pop();
    if (frame === undefined) {
      throw new Error("NEXT WITHOUT FOR" + (variable !== null ? " " + variable : ""));
    }
    if (variable === null || frame.key === variable) break;
  }
  var newValue = V[frame.key] + frame.step;
  V[frame.key] = newValue;
  var continuing = frame.step >= 0 ? newValue <= frame.limit : newValue >= frame.limit;
  if (continuing) {
    forStack.push(frame);
    return frame.bodyPc;
  }
  return fallthroughPc;
}
function __return(gosubStack) {
  var pc = gosubStack.pop();
  if (pc === undefined) {
    throw new Error("RETURN WITHOUT GOSUB");
  }
  return pc;
}
function __onJumpTarget(selector, targets) {
  var n = Math.trunc(selector);
  if (n < 1 || n > targets.length) return null;
  return targets[n - 1];
}
function __inputCoerce(raw, isString) {
  var trimmed = raw.trim();
  if (isString) return trimmed;
  var n = Number(trimmed);
  return isNaN(n) ? 0 : n;
}
`.trim();
