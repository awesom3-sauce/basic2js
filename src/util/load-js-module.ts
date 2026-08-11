// Dynamically imports a string of ES module JS source text via a `data:`
// URL import — used to execute compiler-emitted code (always a
// self-contained ES module exporting `run(rt)`, see
// src/emitter/emit-program.ts) without writing it to a temp file first.
// Supported natively by Node's ESM loader.

export async function importModuleFromSource(source: string): Promise<Record<string, unknown>> {
  const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
  return (await import(dataUrl)) as Record<string, unknown>;
}
