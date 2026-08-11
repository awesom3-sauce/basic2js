// `basic2js convert <input.bas> -o <output.js> [--standalone]`
//
// TODO (build order step 19): read input.bas, run compile() from
// src/index.ts, write the resulting JS to -o (or stdout if omitted). With
// --standalone, append an import.meta.url-guarded footer that constructs a
// NodeRuntime and calls run(), so `node output.js` works standalone.

export {};
