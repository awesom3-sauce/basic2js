// Unit tests for the in-memory "disk" backing BrowserRuntime/TestRuntime's
// GW-BASIC dialect file I/O (see src/dialect.ts and this file's own header
// comment for why VirtualFileSystem is genuinely shared between the two,
// unlike NodeRuntime which uses real node:fs directly).

import { describe, expect, it } from "vitest";
import { VirtualFileSystem } from "./virtual-fs.js";

describe("VirtualFileSystem — OPEN/CLOSE", () => {
  it("OUTPUT creates/truncates the disk entry immediately, even before any write", async () => {
    const disk = new Map<string, string>([["A.TXT", "OLD CONTENT"]]);
    const vfs = new VirtualFileSystem(disk);
    await vfs.openFile(1, "A.TXT", "output");
    expect(disk.get("A.TXT")).toBe("");
  });

  it("APPEND leaves existing disk content untouched until a write happens", async () => {
    const disk = new Map<string, string>([["A.TXT", "OLD"]]);
    const vfs = new VirtualFileSystem(disk);
    await vfs.openFile(1, "A.TXT", "append");
    expect(disk.get("A.TXT")).toBe("OLD");
  });

  it("APPEND on a file that doesn't exist yet behaves like OUTPUT (starts empty)", async () => {
    const vfs = new VirtualFileSystem();
    await vfs.openFile(1, "NEW.TXT", "append");
    await vfs.writeFile(1, "HI");
    expect(vfs.files.get("NEW.TXT")).toBe("HI");
  });

  it("OPEN...FOR INPUT on a nonexistent file throws a FILE ERROR", async () => {
    const vfs = new VirtualFileSystem();
    await expect(vfs.openFile(1, "MISSING.TXT", "input")).rejects.toThrow(
      /FILE ERROR: could not open "MISSING.TXT": no such file/,
    );
  });

  it("re-OPENing an already-open file number throws a FILE ERROR", async () => {
    const vfs = new VirtualFileSystem();
    await vfs.openFile(1, "A.TXT", "output");
    await expect(vfs.openFile(1, "B.TXT", "output")).rejects.toThrow(
      /FILE ERROR: file #1 is already open/,
    );
  });

  it("CLOSE on an unopened file number is a silent no-op, matching real GW-BASIC", async () => {
    const vfs = new VirtualFileSystem();
    await expect(vfs.closeFile(99)).resolves.toBeUndefined();
  });

  it("CLOSE frees the file number for reuse", async () => {
    const vfs = new VirtualFileSystem();
    await vfs.openFile(1, "A.TXT", "output");
    await vfs.closeFile(1);
    await expect(vfs.openFile(1, "B.TXT", "output")).resolves.toBeUndefined();
  });

  it("closeAllFiles() frees every open file number at once", async () => {
    const vfs = new VirtualFileSystem();
    await vfs.openFile(1, "A.TXT", "output");
    await vfs.openFile(2, "B.TXT", "output");
    await vfs.closeAllFiles();
    await expect(vfs.openFile(1, "C.TXT", "output")).resolves.toBeUndefined();
    await expect(vfs.openFile(2, "D.TXT", "output")).resolves.toBeUndefined();
  });
});

describe("VirtualFileSystem — writeFile", () => {
  it("appends successive writes onto the same disk entry", async () => {
    const vfs = new VirtualFileSystem();
    await vfs.openFile(1, "A.TXT", "output");
    await vfs.writeFile(1, "ONE\n");
    await vfs.writeFile(1, "TWO\n");
    expect(vfs.files.get("A.TXT")).toBe("ONE\nTWO\n");
  });

  it("writing to a file open for INPUT throws a FILE ERROR", async () => {
    const vfs = new VirtualFileSystem(new Map([["A.TXT", "X"]]));
    await vfs.openFile(1, "A.TXT", "input");
    await expect(vfs.writeFile(1, "Y")).rejects.toThrow(
      /FILE ERROR: file #1 is open for INPUT, not OUTPUT\/APPEND/,
    );
  });

  it("writing to an unopened file number throws a FILE ERROR", async () => {
    const vfs = new VirtualFileSystem();
    await expect(vfs.writeFile(1, "X")).rejects.toThrow(/FILE ERROR: file #1 is not open/);
  });
});

describe("VirtualFileSystem — readFileLine / isFileEof", () => {
  it("reads lines in order, without trailing newlines", async () => {
    const vfs = new VirtualFileSystem(new Map([["A.TXT", "ONE\nTWO\nTHREE\n"]]));
    await vfs.openFile(1, "A.TXT", "input");
    expect(await vfs.readFileLine(1)).toBe("ONE");
    expect(await vfs.readFileLine(1)).toBe("TWO");
    expect(await vfs.readFileLine(1)).toBe("THREE");
  });

  it("isFileEof is false until every line has been read, then true", async () => {
    const vfs = new VirtualFileSystem(new Map([["A.TXT", "ONE\nTWO\n"]]));
    await vfs.openFile(1, "A.TXT", "input");
    expect(vfs.isFileEof(1)).toBe(false);
    await vfs.readFileLine(1);
    expect(vfs.isFileEof(1)).toBe(false);
    await vfs.readFileLine(1);
    expect(vfs.isFileEof(1)).toBe(true);
  });

  it("an empty file is immediately EOF", async () => {
    const vfs = new VirtualFileSystem(new Map([["EMPTY.TXT", ""]]));
    await vfs.openFile(1, "EMPTY.TXT", "input");
    expect(vfs.isFileEof(1)).toBe(true);
  });

  it("a single trailing newline doesn't produce a spurious extra empty line", async () => {
    const vfs = new VirtualFileSystem(new Map([["A.TXT", "ONLY\n"]]));
    await vfs.openFile(1, "A.TXT", "input");
    expect(await vfs.readFileLine(1)).toBe("ONLY");
    expect(vfs.isFileEof(1)).toBe(true);
  });

  it("reading past EOF throws a FILE ERROR", async () => {
    const vfs = new VirtualFileSystem(new Map([["A.TXT", "ONE\n"]]));
    await vfs.openFile(1, "A.TXT", "input");
    await vfs.readFileLine(1);
    await expect(vfs.readFileLine(1)).rejects.toThrow(
      /FILE ERROR: attempted to read past the end of file #1/,
    );
  });

  it("reading from a file open for OUTPUT throws a FILE ERROR", async () => {
    const vfs = new VirtualFileSystem();
    await vfs.openFile(1, "A.TXT", "output");
    await expect(vfs.readFileLine(1)).rejects.toThrow(
      /FILE ERROR: file #1 is open for OUTPUT, not INPUT/,
    );
  });

  it("isFileEof on an unopened file number throws a FILE ERROR", () => {
    const vfs = new VirtualFileSystem();
    expect(() => vfs.isFileEof(1)).toThrow(/FILE ERROR: file #1 is not open/);
  });
});

describe("VirtualFileSystem — disk persistence across instances", () => {
  it("a Map passed to the constructor is shared, not copied — a second VirtualFileSystem over the same Map sees prior writes", async () => {
    const disk = new Map<string, string>();
    const writer = new VirtualFileSystem(disk);
    await writer.openFile(1, "A.TXT", "output");
    await writer.writeFile(1, "PERSISTED");

    const reader = new VirtualFileSystem(disk);
    await reader.openFile(2, "A.TXT", "input");
    expect(await reader.readFileLine(2)).toBe("PERSISTED");
  });
});
