// `basic2js convert <input.bas> [-o <output.js>] [--standalone]`

import { readFile, writeFile } from "node:fs/promises";
import { compile } from "../../index.js";
import { STANDALONE_FOOTER } from "../../emitter/standalone-footer.js";

export interface ConvertCommandOptions {
  readonly output?: string;
  readonly standalone?: boolean;
}

export async function convertCommand(
  filePath: string,
  options: ConvertCommandOptions,
): Promise<void> {
  const source = await readFile(filePath, "utf-8");
  const { js } = compile(source);
  const output = options.standalone ? `${js}\n\n${STANDALONE_FOOTER}\n` : js;

  if (options.output) {
    await writeFile(options.output, output, "utf-8");
  } else {
    process.stdout.write(output);
  }
}
