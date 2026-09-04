// Displays the virtual filesystem's contents (GW-BASIC dialect's
// OPEN/CLOSE/PRINT #/INPUT # — see @core/dialect.js) after a run: filename
// + a scrollable preview of what the program wrote, plus a button to wipe
// the virtual disk. Presentation only — App.tsx supplies `files` from
// useBrowserRuntime and `onClear` wired to its clearFiles().
//
// Rendered only when there's something to show (App.tsx gates on dialect
// === "gwbasic"), so an empty state here just means "no files written yet
// this session", not "this feature doesn't apply".

import styles from "./VirtualFiles.module.css";

export interface VirtualFilesProps {
  readonly files: ReadonlyMap<string, string>;
  readonly onClear: () => void;
}

export default function VirtualFiles({ files, onClear }: VirtualFilesProps) {
  const entries = [...files.entries()];

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Virtual files</h3>
        <button
          type="button"
          className={styles.clearButton}
          onClick={onClear}
          disabled={entries.length === 0}
        >
          Clear
        </button>
      </div>
      {entries.length === 0 ? (
        <p className={styles.empty}>
          No files yet — OPEN a file FOR OUTPUT or APPEND in a GW-BASIC program to write one.
        </p>
      ) : (
        <ul className={styles.list}>
          {entries.map(([name, content]) => (
            <li key={name} className={styles.entry}>
              <div className={styles.filename}>{name}</div>
              <pre className={styles.content}>{content.length > 0 ? content : "(empty)"}</pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
