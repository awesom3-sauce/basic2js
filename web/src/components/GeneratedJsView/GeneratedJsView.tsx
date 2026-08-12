// Read-only view of the JS the compiler emitted for the current source, for
// users who want to see/copy the generated code. Presentation only.

import styles from "./GeneratedJsView.module.css";

export interface GeneratedJsViewProps {
  readonly js: string;
}

export default function GeneratedJsView({ js }: GeneratedJsViewProps) {
  if (js === "") {
    return <p className={styles.empty}>Click "Convert" or "Run" to see the generated JS here.</p>;
  }
  return (
    <pre className={styles.code}>
      <code>{js}</code>
    </pre>
  );
}
