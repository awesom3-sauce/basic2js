// Displays a compile-time error message or a runtime BasicRuntimeError,
// with the BASIC line number surfaced prominently when known. Presentation
// only — App.tsx conditionally renders this rather than passing a
// nullable prop, so this component never has to render "nothing".

import styles from "./ErrorPanel.module.css";

export interface ErrorPanelProps {
  readonly message: string;
  /** The BASIC line number the error is attributed to, if known (compile errors already embed this in `message`; runtime errors carry it separately — see BasicRuntimeError). */
  readonly line?: number;
}

export default function ErrorPanel({ message, line }: ErrorPanelProps) {
  return (
    <div className={styles.panel} role="alert">
      {line !== undefined && <span className={styles.line}>Line {line}</span>}
      <span className={styles.message}>{message}</span>
    </div>
  );
}
