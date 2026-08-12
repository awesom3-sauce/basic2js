// Composes the UI components + owns top-level state (source text, compiled
// JS, output log, pending-input state, errors). Contains NO compiler logic
// of its own — everything compiler-related goes through ./engine.
//
// This is one of exactly two files (with main.tsx) a future UI redesign
// necessarily touches; components/** can be swapped freely against the same
// ./engine contract. See CLAUDE.md's "UI replaceability contract".

import { useState } from "react";
import Toolbar from "./components/Toolbar/Toolbar";
import CodeEditor from "./components/CodeEditor/CodeEditor";
import GeneratedJsView from "./components/GeneratedJsView/GeneratedJsView";
import OutputConsole from "./components/OutputConsole/OutputConsole";
import InputPrompt from "./components/InputPrompt/InputPrompt";
import ErrorPanel from "./components/ErrorPanel/ErrorPanel";
import VirtualFiles from "./components/VirtualFiles/VirtualFiles";
import { compileProgram } from "./engine/compileProgram";
import { useBrowserRuntime } from "./engine/useBrowserRuntime";
import { EXAMPLES, type Example } from "./examples";
import { DEFAULT_DIALECT, type Dialect } from "@core/dialect.js";
import styles from "./App.module.css";

const INITIAL_SOURCE = EXAMPLES[0]?.source ?? '10 PRINT "HELLO, WORLD"\n20 END\n';

export default function App() {
  const [source, setSource] = useState(INITIAL_SOURCE);
  const [js, setJs] = useState("");
  const [compileError, setCompileError] = useState<string | null>(null);
  const [dialect, setDialect] = useState<Dialect>(DEFAULT_DIALECT);
  const runtime = useBrowserRuntime();

  function handleConvert() {
    const result = compileProgram(source, dialect);
    if (result.ok) {
      setJs(result.js);
      setCompileError(null);
    } else {
      setJs("");
      setCompileError(result.message);
    }
  }

  async function handleRun() {
    const result = compileProgram(source, dialect);
    if (!result.ok) {
      setJs("");
      setCompileError(result.message);
      return;
    }
    setJs(result.js);
    setCompileError(null);
    await runtime.run(result.js);
  }

  function handleReset() {
    runtime.reset();
  }

  function handleSelectExample(example: Example) {
    setSource(example.source);
    setDialect(example.dialect ?? DEFAULT_DIALECT);
    setJs("");
    setCompileError(null);
    runtime.reset();
  }

  // A runtime error (from the program that just ran) takes precedence over
  // a stale compile-time error from a previous edit, since it's the more
  // recent/relevant failure.
  const displayedError =
    runtime.error !== null
      ? { message: runtime.error.message, line: runtime.error.line }
      : compileError !== null
        ? { message: compileError, line: undefined }
        : null;

  return (
    <div className={styles.app}>
      <Toolbar
        onConvert={handleConvert}
        onRun={() => void handleRun()}
        onReset={handleReset}
        onSelectExample={handleSelectExample}
        dialect={dialect}
        onDialectChange={setDialect}
        running={runtime.running}
      />
      <main className={styles.main}>
        <section className={styles.pane}>
          <h2 className={styles.paneTitle}>BASIC source</h2>
          <CodeEditor value={source} onChange={setSource} />
        </section>
        <section className={styles.pane}>
          <h2 className={styles.paneTitle}>Output</h2>
          <OutputConsole lines={runtime.output} />
          {runtime.pendingPrompt !== null && (
            <InputPrompt prompt={runtime.pendingPrompt} onSubmit={runtime.submitInput} />
          )}
          {displayedError !== null && (
            <ErrorPanel message={displayedError.message} line={displayedError.line} />
          )}
          {dialect === "gwbasic" && (
            <VirtualFiles files={runtime.files} onClear={runtime.clearFiles} />
          )}
        </section>
        <section className={styles.pane}>
          <h2 className={styles.paneTitle}>Generated JS</h2>
          <GeneratedJsView js={js} />
        </section>
      </main>
    </div>
  );
}
