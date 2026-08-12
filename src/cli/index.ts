#!/usr/bin/env node
// basic2js CLI entry point.

import { cac } from "cac";
import { runCommand } from "./commands/run.js";
import { convertCommand } from "./commands/convert.js";

const cli = cac("basic2js");

cli
  .command("run <file>", "Compile and execute a BASIC program")
  .option("--emit-ast", "Print the parsed AST as JSON instead of executing")
  .option("--emit-steps", "Print the lowered Step[] as JSON instead of executing")
  .example("basic2js run program.bas")
  .example("basic2js run program.bas < input.txt   # non-interactive, scripted INPUT")
  .example("basic2js run program.bas --emit-ast     # debug: dump the parsed AST")
  .example("basic2js run program.bas --emit-steps   # debug: dump the lowered Step[]")
  .action(async (file: string, options: { emitAst?: boolean; emitSteps?: boolean }) => {
    try {
      await runCommand(file, { emitAst: options.emitAst, emitSteps: options.emitSteps });
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

cli
  .command("convert <file>", "Compile a BASIC program to JavaScript")
  .option("-o, --output <path>", "Write the generated JS to this file instead of stdout")
  .option(
    "--standalone",
    "Append a footer so `node <output>` runs it directly, no basic2js install needed",
  )
  .example("basic2js convert program.bas -o program.js")
  .example("basic2js convert program.bas --standalone -o program.js && node program.js")
  .action(async (file: string, options: { output?: string; standalone?: boolean }) => {
    try {
      await convertCommand(file, options);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

cli.help();
cli.version("0.1.0");

cli.parse();
