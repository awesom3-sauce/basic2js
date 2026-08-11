#!/usr/bin/env node
// basic2js CLI entry point.
//
// TODO (build order step 19): --standalone/--emit-ast/--emit-steps flags,
// richer help text, more precise exit codes.

import { cac } from "cac";
import { runCommand } from "./commands/run.js";
import { convertCommand } from "./commands/convert.js";

const cli = cac("basic2js");

cli.command("run <file>", "Compile and execute a BASIC program").action(async (file: string) => {
  try {
    await runCommand(file);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
});

cli
  .command("convert <file>", "Compile a BASIC program to JavaScript")
  .option("-o, --output <path>", "Write the generated JS to this file instead of stdout")
  .action(async (file: string, options: { output?: string }) => {
    try {
      await convertCommand(file, options.output);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

cli.help();
cli.version("0.1.0");

cli.parse();
