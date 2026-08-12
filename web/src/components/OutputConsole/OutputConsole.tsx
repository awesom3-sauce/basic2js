// Renders the running program's PRINT output log (from
// engine/useBrowserRuntime.ts's `output` array). Presentation only.
//
// `lines` holds one entry per PRINT *call* (which may or may not itself
// end in a newline, depending on a trailing `;`/`,` — see DIALECT.md), not
// one entry per visual line — joined into a single block here so
// consecutive suppressed-newline PRINTs still read as a continuous stream,
// matching a real console.

import styles from "./OutputConsole.module.css";

export interface OutputConsoleProps {
  readonly lines: readonly string[];
}

export default function OutputConsole({ lines }: OutputConsoleProps) {
  if (lines.length === 0) {
    return <p className={styles.empty}>Program output will appear here.</p>;
  }
  return <pre className={styles.console}>{lines.join("")}</pre>;
}
