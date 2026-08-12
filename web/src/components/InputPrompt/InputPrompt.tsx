// Inline input box shown when the running program hits INPUT and
// BrowserRuntime is awaiting a value (engine/useBrowserRuntime.ts's
// `pendingPrompt` + `submitInput`). Presentation only.

import { useState, type FormEvent } from "react";
import styles from "./InputPrompt.module.css";

export interface InputPromptProps {
  readonly prompt: string;
  readonly onSubmit: (value: string) => void;
}

export default function InputPrompt({ prompt, onSubmit }: InputPromptProps) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(value);
    setValue("");
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <label className={styles.label} htmlFor="basic-input">
        {prompt || "?"}
      </label>
      <input
        id="basic-input"
        className={styles.input}
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoFocus
        autoComplete="off"
      />
      <button type="submit" className={styles.button}>
        Submit
      </button>
    </form>
  );
}
