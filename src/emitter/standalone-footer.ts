// Optional footer appended to `basic2js convert --standalone`'s output
// (build order step 19) — makes `node output.js` runnable directly, with
// no `basic2js` CLI or `basic2js` package install needed at all.
//
// Deliberately does NOT import NodeRuntime (or anything else from this
// package): the whole point of emitted output having zero import
// dependencies (see emit-program.ts's header comment) is that it can be
// copied anywhere and just work under plain Node — importing NodeRuntime
// here would silently break that property for anyone who doesn't also
// have basic2js installed as a resolvable dependency wherever the output
// file ends up. Instead, this inlines a small equivalent runtime as plain
// JS text, mirroring NodeRuntime's real behavior (including a real
// mulberry32 PRNG for RND/RANDOMIZE, not Math.random(), so a standalone
// program's RANDOMIZE-seeded output matches what `basic2js run` and the
// web UI would produce) — the same "duplicate the pure logic as embedded
// text, don't import it" pattern prelude.ts already uses throughout for
// exactly this reason.
//
// Detecting "was this module executed directly via \`node file.js\`" (the
// ESM equivalent of CommonJS's \`require.main === module\`) needs more care
// than the naive \`import.meta.url === "file://" + process.argv[1]\` check:
// real bug found via direct testing, not caught by reasoning about it in
// advance — that naive check silently fails (no output, no error, exit 0
// as if nothing happened) whenever the invocation path crosses a symlink,
// which is the *common* case on macOS (\`/tmp\` -> \`/private/tmp\`,
// \`/var\` -> \`/private/var\`) since \`import.meta.url\` reflects Node's
// resolved (symlink-followed) module path while \`process.argv[1]\` is
// whatever un-resolved string the user typed. Fixed by resolving both
// sides through \`fs.realpathSync\`/\`url.pathToFileURL\` before comparing,
// so symlinks, relative paths, and URL-encoding differences all wash out
// the same way on both sides. Importing the standalone output as a library
// (\`import { run } from "./output.js"\`) still works without auto-running
// anything, same as the non-footer form.

export const STANDALONE_FOOTER = `
const __isMain = await (async () => {
  if (process.argv[1] === undefined) return false;
  const { realpathSync } = await import("node:fs");
  const { pathToFileURL } = await import("node:url");
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
})();
if (__isMain) {
  const { createInterface } = await import("node:readline");
  let __rngState = Date.now() >>> 0;
  function __mulberry32() {
    __rngState = (__rngState + 0x6d2b79f5) | 0;
    let t = Math.imul(__rngState ^ (__rngState >>> 15), 1 | __rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  let __rl;
  let __lines;
  let __hadError = false;
  const rt = {
    print(text) {
      process.stdout.write(text);
    },
    async input(promptText) {
      if (__rl === undefined) {
        __rl = createInterface({ input: process.stdin, output: process.stdout });
        __lines = __rl[Symbol.asyncIterator]();
      }
      if (promptText !== null) process.stdout.write(promptText);
      const { value, done } = await __lines.next();
      return done ? "" : value;
    },
    random() {
      return __mulberry32();
    },
    seedRandom(seed) {
      __rngState = seed >>> 0;
    },
    reportError(error) {
      __hadError = true;
      process.stderr.write(\`\${error.message} (line \${error.line})\\n\`);
    },
  };
  await run(rt);
  __rl?.close();
  if (__hadError) process.exitCode = 1;
}
`.trim();
