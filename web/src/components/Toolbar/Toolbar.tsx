// Convert / Run / Reset buttons + example-loading trigger + dialect
// selector. Presentation only — calls back into props supplied by App.tsx
// (via engine/).

import type { Dialect } from "@core/dialect.js";
import type { Example } from "../../examples";
import ExamplesMenu from "../ExamplesMenu/ExamplesMenu";
import DialectSelector from "../DialectSelector/DialectSelector";
import styles from "./Toolbar.module.css";

export interface ToolbarProps {
  readonly onConvert: () => void;
  readonly onRun: () => void;
  readonly onReset: () => void;
  readonly onSelectExample: (example: Example) => void;
  readonly dialect: Dialect;
  readonly onDialectChange: (dialect: Dialect) => void;
  readonly running: boolean;
}

export default function Toolbar({
  onConvert,
  onRun,
  onReset,
  onSelectExample,
  dialect,
  onDialectChange,
  running,
}: ToolbarProps) {
  return (
    <div className={styles.toolbar}>
      <span className={styles.title}>basic2js</span>
      <div className={styles.actions}>
        <DialectSelector value={dialect} onChange={onDialectChange} disabled={running} />
        <button type="button" className={styles.button} onClick={onConvert} disabled={running}>
          Convert
        </button>
        <button
          type="button"
          className={`${styles.button} ${styles.primary}`}
          onClick={onRun}
          disabled={running}
        >
          {running ? "Running…" : "Run"}
        </button>
        <button type="button" className={styles.button} onClick={onReset} disabled={running}>
          Reset
        </button>
        <ExamplesMenu onSelect={onSelectExample} disabled={running} />
      </div>
    </div>
  );
}
