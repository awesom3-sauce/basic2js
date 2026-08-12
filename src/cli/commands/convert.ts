// `basic2js convert <input.bas> [-o <output.js>] [--standalone] [--dialect <classic|gwbasic>]`

import { readFile, writeFile } from "node:fs/promises";
import { compile } from "../../index.js";
import { STANDALONE_FOOTER } from "../../emitter/standalone-footer.js";
import { DEFAULT_DIALECT, type Dialect } from "../../dialect.js";

export interface ConvertCommandOptions {
  readonly output?: string;
  readonly standalone?: boolean;
  readonly dialect?: Dialect;
}

export async function convertCommand(
  filePath: string,
  options: ConvertCommandOptions,
): Promise<void> {
  const source = await readFile(filePath, "utf-8");
  const { js } = compile(source, options.dialect ?? DEFAULT_DIALECT);
  const output = options.standalone ? `${js}\n\n${STANDALONE_FOOTER}\n` : js;

  if (options.output) {
    await writeFile(options.output, output, "utf-8");
  } else {
    process.stdout.write(output);
  }
}
