// Textarea (or later, a real code-editor widget) for pasting/editing BASIC
// source. Presentation + local wiring only — receives value/onChange props
// from App.tsx, no compiler calls of its own.

import type { ChangeEvent } from "react";
import styles from "./CodeEditor.module.css";

export interface CodeEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
}

export default function CodeEditor({ value, onChange }: CodeEditorProps) {
  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
  }

  return (
    <textarea
      className={styles.editor}
      value={value}
      onChange={handleChange}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      placeholder='10 PRINT "HELLO, WORLD"&#10;20 END'
      aria-label="BASIC source code"
    />
  );
}
