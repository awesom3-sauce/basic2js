// Browser implementation of BasicRuntime — wrapped by web/src/engine's
// useBrowserRuntime.ts for the React UI. Framework-agnostic on its own (no
// DOM manipulation beyond what's passed in via callbacks/an output sink),
// so it can be driven by React state instead of touching the DOM directly.
//
// TODO (build order step 17): export class BrowserRuntime implements
// BasicRuntime, constructed with callback hooks (onPrint, onInputRequest
// returning a Promise<string>, onError) supplied by the UI layer.

export {};
