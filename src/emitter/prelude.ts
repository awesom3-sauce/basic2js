// Small embedded support-library text inlined at the top of every
// generated output.js, so emitted files have zero import dependencies on
// this compiler's own source tree (see CLAUDE.md's runtime host contract).
//
// Scope note: started in build order step 4 with just the two helpers
// PRINT needs (see emit-print.ts); expanded through step 14 as more
// builtins/formatting rules land, at which point this may be assembled
// from src/runtime/shared/*'s logic rather than hand-written here. Helper
// names are prefixed with "__" and are never valid BASIC identifiers
// (which live in the V/ARR objects, not as bare JS identifiers — see
// mangle.ts), so they can't collide with user variables.

export const PRELUDE = `
function __fmtNum(n) {
  return (n >= 0 ? " " : "") + String(n) + " ";
}
function __tabPad(currentLength) {
  var nextZone = (Math.floor(currentLength / 14) + 1) * 14;
  return " ".repeat(nextZone - currentLength);
}
`.trim();
