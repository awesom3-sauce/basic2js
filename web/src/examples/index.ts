// Registry of bundled sample .bas programs shown in ExamplesMenu. Each
// file here is a byte-for-byte copy of its tests/golden/programs/<name>/
// program.bas counterpart (see examples.sync.test.ts, which asserts that
// directly so the web UI and the test suite never silently drift apart —
// see this directory's README).
//
// Imported via Vite's `?raw` suffix (a string import of the file's raw
// contents) — no bundler config beyond what create-vite already ships.
//
// `dialect` (default "classic" when absent) lets a bundled example declare
// which BASIC dialect (see @core/dialect.js) it needs to compile —
// gwbasic-file-io uses GW-BASIC's OPEN/CLOSE/PRINT #/INPUT #/EOF(), so
// selecting it also needs to flip the toolbar's dialect dropdown, not just
// load the source text; see App.tsx's handleSelectExample.

import type { Dialect } from "@core/dialect.js";
import bubbleSort from "./bubble-sort.bas?raw";
import dataReadDemo from "./data-read-demo.bas?raw";
import fizzbuzz from "./fizzbuzz.bas?raw";
import gotoBasics from "./goto-basics.bas?raw";
import guessNumber from "./guess-number.bas?raw";
import gwbasicFileIo from "./gwbasic-file-io.bas?raw";
import primeSieve from "./prime-sieve.bas?raw";
import tempConverter from "./temp-converter.bas?raw";

export interface Example {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly dialect?: Dialect;
}

export const EXAMPLES: readonly Example[] = [
  { id: "goto-basics", label: "GOTO basics", source: gotoBasics },
  { id: "fizzbuzz", label: "FizzBuzz", source: fizzbuzz },
  { id: "temp-converter", label: "Temperature converter", source: tempConverter },
  { id: "bubble-sort", label: "Bubble sort", source: bubbleSort },
  { id: "data-read-demo", label: "DATA/READ roster", source: dataReadDemo },
  { id: "prime-sieve", label: "Prime sieve", source: primeSieve },
  { id: "guess-number", label: "Guess the number", source: guessNumber },
  {
    id: "gwbasic-file-io",
    label: "GW-BASIC: file I/O",
    source: gwbasicFileIo,
    dialect: "gwbasic",
  },
];
