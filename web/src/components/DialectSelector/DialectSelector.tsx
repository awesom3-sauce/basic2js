// Dropdown to pick which BASIC dialect the source is compiled against (see
// @core/dialect.js). Presentation + local wiring only — App.tsx owns the
// actual `dialect` state and passes it down.

import type { ChangeEvent } from "react";
import type { Dialect } from "@core/dialect.js";
import styles from "./DialectSelector.module.css";

export interface DialectSelectorProps {
  readonly value: Dialect;
  readonly onChange: (dialect: Dialect) => void;
  readonly disabled?: boolean;
}

const DIALECT_LABELS: Record<Dialect, string> = {
  classic: "Classic BASIC",
  gwbasic: "GW-BASIC (file I/O)",
};

export default function DialectSelector({ value, onChange, disabled }: DialectSelectorProps) {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    if (next === "classic" || next === "gwbasic") onChange(next);
  }

  return (
    <select
      className={styles.select}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      aria-label="BASIC dialect"
    >
      {(Object.keys(DIALECT_LABELS) as Dialect[]).map((dialect) => (
        <option key={dialect} value={dialect}>
          {DIALECT_LABELS[dialect]}
        </option>
      ))}
    </select>
  );
}
