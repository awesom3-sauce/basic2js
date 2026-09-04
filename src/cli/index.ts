#!/usr/bin/env node
// basic2js CLI entry point.

import { cac } from "cac";
import { runCommand } from "./commands/run.js";
import { convertCommand } from "./commands/convert.js";
import { DEFAULT_DIALECT, type Dialect } from "../dialect.js";

const cli = cac("basic2js");

/** Validates `--dialect <value>` against the real Dialect union, since cac hands us a bare string with no type-checking of its own. */
function parseDialectOption(value: string | undefined): Dialect {
  if (value === undefined) return DEFAULT_DIALECT;
  if (value === "classic" || value === "gwbasic") return value;
  throw new Error(`Unknown --dialect "${value}" — expected "classic" or "gwbasic"`);
}

cli
  .command("run <file>", "Compile and execute a BASIC program")
  .option("--emit-ast", "Print the parsed AST as JSON instead of executing")
  .option("--emit-steps", "Print the lowered Step[] as JSON instead of executing")
  .option(
    "--dialect <name>",
    'BASIC dialect to compile against: "classic" (default) or "gwbasic" (adds OPEN/CLOSE/PRINT #/INPUT #/EOF() sequential file I/O)',
  )
  .example("basic2js run program.bas")
  .example("basic2js run program.bas < input.txt   # non-interactive, scripted INPUT")
  .example("basic2js run program.bas --emit-ast     # debug: dump the parsed AST")
  .example("basic2js run program.bas --emit-steps   # debug: dump the lowered Step[]")
  .example("basic2js run program.bas --dialect gwbasic   # enable file I/O")
  .action(
    async (file: string, options: { emitAst?: boolean; emitSteps?: boolean; dialect?: string }) => {
      try {
        await runCommand(file, {
          emitAst: options.emitAst,
          emitSteps: options.emitSteps,
          dialect: parseDialectOption(options.dialect),
        });
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    },
  );

cli
  .command("convert <file>", "Compile a BASIC program to JavaScript")
  .option("-o, --output <path>", "Write the generated JS to this file instead of stdout")
  .option(
    "--standalone",
    "Append a footer so `node <output>` runs it directly, no basic2js install needed",
  )
  .option(
    "--dialect <name>",
    'BASIC dialect to compile against: "classic" (default) or "gwbasic" (adds OPEN/CLOSE/PRINT #/INPUT #/EOF() sequential file I/O)',
  )
  .example("basic2js convert program.bas -o program.js")
  .example("basic2js convert program.bas --standalone -o program.js && node program.js")
  .example("basic2js convert program.bas --dialect gwbasic -o program.js")
  .action(
    async (file: string, options: { output?: string; standalone?: boolean; dialect?: string }) => {
      try {
        await convertCommand(file, {
          output: options.output,
          standalone: options.standalone,
          dialect: parseDialectOption(options.dialect),
        });
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
      }
    },
  );

cli.help();
cli.version("0.1.0");

cli.parse();
