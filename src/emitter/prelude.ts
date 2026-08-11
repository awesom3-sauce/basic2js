// Small embedded support-library text inlined at the top of every
// generated output.js, so emitted files have zero import dependencies on
// this compiler's own source tree (see CLAUDE.md's runtime host contract).
//
// Started in build order step 4 with PRINT's two formatting helpers (see
// emit-print.ts); grew a helper alongside each control-flow/IO construct
// that needed shared runtime logic since (FOR/NEXT's __nextFor, GOSUB's
// __return and ON...GOTO/GOSUB's __onJumpTarget, INPUT's __inputCoerce,
// DIM/array access's __arrAlloc/__arrEnsure/__arrIndex/__arrGet/__arrSet,
// DATA/READ/RESTORE's __readNext/__restoreTarget, and (build order step 14)
// the string/math builtin functions and PRINT's TAB()/SPC() helpers).
// Arrays are represented as { dims: number[], data: T[] } — a flat array
// with a manually computed linear index, not nested arrays, so 1D and 2D
// (and, not that DIALECT.md's v1 scope asks for it, N-D) access share the
// same indexing logic. Helper names are prefixed with "__" and are never
// valid BASIC identifiers (which live in the V/ARR objects, not as bare
// JS identifiers — see mangle.ts), so they can't collide with user
// variables. Helpers that need
// closure state living inside run() (V, forStack, gosubStack) take it as
// an explicit parameter, since PRELUDE functions sit outside that closure.
//
// Scope note on step 14's builtins specifically: the pure, stateless
// string/math functions (LEFT$, MID$, SQR, ...) are implemented directly
// here as plain JS, the same way every other helper above is — there's no
// TS mirror of their logic under src/runtime/shared/, since (unlike RND,
// which genuinely needs the host runtime for entropy — see
// src/runtime/shared/random.ts) nothing outside emitted code ever needs to
// call them, so a second copy would only be a duplication/drift risk with
// no payoff. See src/runtime/shared/strings.ts's and math.ts's header
// comments for the same note from the other side.
//
// CAUTION when editing regex literals below (e.g. __val's number-prefix
// match): this whole PRELUDE constant is itself one JS template literal,
// so every backslash inside a regex pattern written as plain text below
// must be doubled in this file's own source. A single backslash isn't a
// recognized template-literal escape, so TypeScript/JS silently drops it
// while parsing this file, and the regex source text that actually reaches
// the emitted PRELUDE string ends up missing its backslashes entirely —
// e.g. what looks like a digit-matching escape in the pattern arrives as
// just a bare letter, matching that literal letter instead of any digit.
// This was a real bug, caught by direct testing (VAL("  42.5xyz") was
// returning 0 instead of 42.5) rather than by reasoning about it in
// advance — see CLAUDE.md's step 14 notes.

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
function __readNext(ptr) {
  // References the module-level DATA const directly (declared after this
  // function but, since this only runs once run() is actually called —
  // well after the whole module finishes evaluating — DATA is always
  // initialized by then; same reasoning as LINESTART/DATA_LINE_STARTS
  // being referenced directly by generated case bodies below).
  if (ptr >= DATA.length) {
    throw new Error("OUT OF DATA");
  }
  return DATA[ptr];
}
function __restoreTarget(line) {
  if (line === null) return 0;
  var ptr = DATA_LINE_STARTS[line];
  if (ptr === undefined) {
    throw new Error("RESTORE: no DATA at line " + line);
  }
  return ptr;
}
function __left(s, n) {
  return s.slice(0, Math.max(0, Math.trunc(n)));
}
function __right(s, n) {
  var len = Math.max(0, Math.trunc(n));
  return len === 0 ? "" : s.slice(-len);
}
function __mid(s, start, len) {
  var from = Math.max(0, Math.trunc(start) - 1);
  return len === undefined ? s.slice(from) : s.slice(from, from + Math.max(0, Math.trunc(len)));
}
function __chr(code) {
  return String.fromCharCode(Math.trunc(code));
}
function __asc(s) {
  if (s.length === 0) {
    throw new Error("ILLEGAL FUNCTION CALL: ASC of an empty string");
  }
  return s.charCodeAt(0);
}
function __str(n) {
  // Leading space for non-negative numbers, matching PRINT's own number
  // formatting convention (__fmtNum above) — but, unlike __fmtNum, no
  // trailing space; that's PRINT-specific, not part of STR$'s own output.
  return (n >= 0 ? " " : "") + String(n);
}
function __val(s) {
  // Regex backslashes below are doubled — see this file's top header
  // comment for why (real bug: they weren't doubled at first, and the
  // regex silently lost them).
  var match = s.trim().match(/^[+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?/);
  return match === null ? 0 : Number(match[0]);
}
function __instr(start, haystack, needle) {
  var from = Math.max(0, Math.trunc(start) - 1);
  var index = haystack.indexOf(needle, from);
  return index === -1 ? 0 : index + 1; // BASIC convention: 0 (not -1) means "not found"
}
function __sqr(n) {
  if (n < 0) {
    throw new Error("ILLEGAL FUNCTION CALL: SQR of a negative number");
  }
  return Math.sqrt(n);
}
function __sgn(n) {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}
function __tabTo(currentLength, col) {
  // TAB(col): pads with spaces so the next segment starts at column col
  // (1-indexed); contributes nothing if already at/past that column (no
  // wraparound to a "next line" in v1 — see DIALECT.md).
  var target = Math.max(0, Math.trunc(col) - 1);
  return target <= currentLength ? "" : " ".repeat(target - currentLength);
}
function __spc(n) {
  return " ".repeat(Math.max(0, Math.trunc(n)));
}
`.trim();
