// Dropdown to load a bundled sample .bas program (from ../../examples,
// which mirrors tests/golden/programs — see its README) into the
// CodeEditor. Presentation + local wiring only.

import type { ChangeEvent } from "react";
import { EXAMPLES, type Example } from "../../examples";
import styles from "./ExamplesMenu.module.css";

export interface ExamplesMenuProps {
  readonly onSelect: (example: Example) => void;
  readonly disabled?: boolean;
}

export default function ExamplesMenu({ onSelect, disabled }: ExamplesMenuProps) {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    const id = event.target.value;
    if (id === "") return;
    const example = EXAMPLES.find((e) => e.id === id);
    if (example !== undefined) onSelect(example);
    event.target.value = ""; // reset to the placeholder so the same example can be re-selected
  }

  return (
    <select
      className={styles.select}
      defaultValue=""
      onChange={handleChange}
      disabled={disabled}
      aria-label="Load an example program"
    >
      <option value="" disabled>
        Load example…
      </option>
      {EXAMPLES.map((example) => (
        <option key={example.id} value={example.id}>
          {example.label}
        </option>
      ))}
    </select>
  );
}
