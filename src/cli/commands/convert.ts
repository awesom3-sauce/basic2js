// `basic2js convert <input.bas> [-o <output.js>]`
//
// TODO (build order step 19): --standalone flag to append an
// import.meta.url-guarded footer that constructs a NodeRuntime and calls
// run(), so `node output.js` works standalone without the CLI.

import { readFile, writeFile } from "node:fs/promises";
import { compile } from "../../index.js";

export async function convertCommand(filePath: string, outputPath?: string): Promise<void> {
  const source = await readFile(filePath, "utf-8");
  const { js } = compile(source);

  if (outputPath) {
    await writeFile(outputPath, js, "utf-8");
  } else {
    process.stdout.write(js);
  }
}
