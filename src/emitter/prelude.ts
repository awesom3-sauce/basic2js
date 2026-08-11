// Small embedded support-library text inlined at the top of every
// generated output.js, so emitted files have zero import dependencies on
// this compiler's own source tree (see CLAUDE.md's runtime host contract).
//
// Started in build order step 4 with PRINT's two formatting helpers (see
// emit-print.ts); grew a helper alongside each control-flow/IO construct
// that needed shared runtime logic since (FOR/NEXT's __nextFor, GOSUB's
// __return and ON...GOTO/GOSUB's __onJumpTarget, INPUT's __inputCoerce,
// DIM/array access's __arrAlloc/__arrEnsure/__arrIndex/__arrGet/__arrSet).
// Arrays are represented as { dims: number[], data: T[] } — a flat array
// with a manually computed linear index, not nested arrays, so 1D and 2D
// (and, not that DIALECT.md's v1 scope asks for it, N-D) access share the
// same indexing logic. Will likely be assembled from src/runtime/shared/*'s
// logic once the full
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
function __arrAlloc(dims, isString) {
  var size = 1;
  for (var i = 0; i < dims.length; i++) size *= dims[i] + 1;
  return { dims: dims, data: new Array(size).fill(isString ? "" : 0) };
}
function __arrEnsure(ARR, key, indices, isString) {
  var entry = ARR[key];
  if (entry === undefined) {
    // Lazily allocated at default size 10 per dimension on first access —
    // classic BASIC behavior for an array never explicitly DIM'd.
    entry = __arrAlloc(
      indices.map(function () {
        return 10;
      }),
      isString,
    );
    ARR[key] = entry;
  }
  return entry;
}
function __arrIndex(entry, indices) {
  if (indices.length !== entry.dims.length) {
    throw new Error("SUBSCRIPT OUT OF RANGE (wrong number of dimensions)");
  }
  var idx = 0;
  for (var i = 0; i < indices.length; i++) {
    var n = Math.trunc(indices[i]);
    if (n < 0 || n > entry.dims[i]) {
      throw new Error("SUBSCRIPT OUT OF RANGE");
    }
    idx = idx * (entry.dims[i] + 1) + n;
  }
  return idx;
}
function __arrGet(ARR, key, indices, isString) {
  var entry = __arrEnsure(ARR, key, indices, isString);
  return entry.data[__arrIndex(entry, indices)];
}
function __arrSet(ARR, key, indices, value, isString) {
  var entry = __arrEnsure(ARR, key, indices, isString);
  entry.data[__arrIndex(entry, indices)] = value;
}
`.trim();
