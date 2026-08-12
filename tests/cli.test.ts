// Integration tests for the CLI's step-19 additions (--emit-ast/--emit-steps,
// --standalone, exit codes) — these genuinely need a real process spawn to
// verify (exit codes, stdout/stderr, and --standalone's output being
// runnable by a *separate* `node` invocation aren't observable by calling
// runCommand()/convertCommand() as plain functions). Runs the CLI via
// `tsx src/cli/index.ts` directly rather than the built dist/ output, so
// this suite works without requiring `npm run build` to have run first.

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI_ENTRY = path.join(REPO_ROOT, "src/cli/index.ts");

async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync("npx", ["tsx", CLI_ENTRY, ...args], { cwd: REPO_ROOT });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (e) {
    const err = e as { stdout: string; stderr: string; code: number };
    return { stdout: err.stdout, stderr: err.stderr, exitCode: err.code };
  }
}

describe("CLI: exit codes", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "basic2js-cli-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("exits 0 for a program that runs cleanly", async () => {
    const file = path.join(dir, "ok.bas");
    await writeFile(file, '10 PRINT "OK"\n20 END\n');
    const result = await runCli(["run", file]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("OK");
  });

  it("exits 1 for a compile-time SemanticError, printing the diagnostic to stderr", async () => {
    const file = path.join(dir, "bad-type.bas");
    await writeFile(file, "10 A$ = 5\n20 END\n");
    const result = await runCli(["run", file]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/TYPE_MISMATCH/);
  });

  it("exits 1 for a runtime BasicRuntimeError (not just 0 because run() itself never rejects)", async () => {
    const file = path.join(dir, "divzero.bas");
    await writeFile(file, '10 PRINT "BEFORE"\n20 PRINT 1 / 0\n30 PRINT "AFTER"\n');
    const result = await runCli(["run", file]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("BEFORE");
    expect(result.stdout).not.toContain("AFTER");
    expect(result.stderr).toMatch(/DIVISION BY ZERO/);
  });
});

describe("CLI: --emit-ast / --emit-steps", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "basic2js-cli-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("--emit-ast prints valid JSON for a Program AST instead of running", async () => {
    const file = path.join(dir, "prog.bas");
    await writeFile(file, '10 PRINT "HI"\n20 END\n');
    const result = await runCli(["run", file, "--emit-ast"]);
    expect(result.exitCode).toBe(0);
    const ast = JSON.parse(result.stdout) as { kind: string };
    expect(ast.kind).toBe("Program");
  });

  it("--emit-steps prints valid JSON for the lowered Step[] instead of running", async () => {
    const file = path.join(dir, "prog.bas");
    await writeFile(file, '10 PRINT "HI"\n20 END\n');
    const result = await runCli(["run", file, "--emit-steps"]);
    expect(result.exitCode).toBe(0);
    const lowered = JSON.parse(result.stdout) as { steps: unknown[] };
    expect(Array.isArray(lowered.steps)).toBe(true);
    expect(lowered.steps.length).toBeGreaterThan(0);
  });

  it("--emit-ast bypasses the SemanticError a normal run would raise", async () => {
    const file = path.join(dir, "bad-type.bas");
    await writeFile(file, "10 A$ = 5\n20 END\n");
    const result = await runCli(["run", file, "--emit-ast"]);
    expect(result.exitCode).toBe(0);
    const ast = JSON.parse(result.stdout) as { kind: string };
    expect(ast.kind).toBe("Program");
  });
});

describe("CLI: --dialect", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "basic2js-cli-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects a GW-BASIC-only OPEN statement without --dialect gwbasic", async () => {
    const file = path.join(dir, "prog.bas");
    await writeFile(file, '10 OPEN "A.TXT" FOR OUTPUT AS #1\n20 CLOSE #1\n');
    const result = await runCli(["run", file]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/OPEN is a GW-BASIC dialect extension/);
  });

  it("--dialect gwbasic compiles and runs real sequential file I/O against the real filesystem", async () => {
    const source = path.join(dir, "prog.bas");
    const target = path.join(dir, "greet.txt");
    await writeFile(
      source,
      `10 OPEN "${target}" FOR OUTPUT AS #1\n` +
        '20 PRINT #1, "HELLO"\n' +
        "30 CLOSE #1\n" +
        `40 OPEN "${target}" FOR INPUT AS #2\n` +
        "50 INPUT #2, A$\n" +
        "60 PRINT A$\n" +
        "70 CLOSE #2\n",
    );
    const result = await runCli(["run", source, "--dialect", "gwbasic"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("HELLO");
    const written = await readFile(target, "utf-8");
    expect(written).toBe("HELLO\n");
  });

  it("rejects an unrecognized --dialect value with a clear error, exit code 1", async () => {
    const file = path.join(dir, "prog.bas");
    await writeFile(file, '10 PRINT "OK"\n20 END\n');
    const result = await runCli(["run", file, "--dialect", "applesoft"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/Unknown --dialect "applesoft"/);
  });

  it("`convert --dialect gwbasic` emits JS that calls the file-I/O runtime methods", async () => {
    const source = path.join(dir, "prog.bas");
    await writeFile(source, '10 OPEN "A.TXT" FOR OUTPUT AS #1\n20 PRINT #1, "HI"\n30 CLOSE #1\n');
    const result = await runCli(["convert", source, "--dialect", "gwbasic"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("rt.openFile(");
    expect(result.stdout).toContain("rt.writeFile(");
    expect(result.stdout).toContain("rt.closeFile(");
  });
});

describe("CLI: convert --standalone", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "basic2js-cli-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("produces output runnable directly via plain `node`, with matching RANDOMIZE/RND output", async () => {
    const source = path.join(dir, "prog.bas");
    const output = path.join(dir, "prog.js");
    await writeFile(source, "10 RANDOMIZE 42\n20 PRINT INT(RND(1) * 100) + 1\n30 END\n");

    const convertResult = await runCli(["convert", source, "--standalone", "-o", output]);
    expect(convertResult.exitCode).toBe(0);

    const js = await readFile(output, "utf-8");
    expect(js).toContain("import.meta.url");

    const nodeResult = await execFileAsync("node", [output]);
    const runResult = await runCli(["run", source]);
    expect(nodeResult.stdout.trim()).toBe(runResult.stdout.trim());
  });

  it("a standalone program's runtime error still exits non-zero under plain `node`", async () => {
    const source = path.join(dir, "divzero.bas");
    const output = path.join(dir, "divzero.js");
    await writeFile(source, "10 PRINT 1 / 0\n20 END\n");
    await runCli(["convert", source, "--standalone", "-o", output]);

    await expect(execFileAsync("node", [output])).rejects.toMatchObject({ code: 1 });
  });
});
