// The BasicRuntime host contract — the sole boundary between generated JS
// and its execution environment (Node CLI vs. browser). See the plan file's
// "Runtime Interface Contract" section for the full rationale.
//
// TODO (build order step 5, expanded step 16 for full error taxonomy):
//
// export interface BasicRuntime {
//   print(text: string): void | Promise<void>;
//   input(promptText: string | null): Promise<string>;   // suspension point
//   random(): number;                                     // 0 <= x < 1
//   seedRandom(seed: number): void;                       // RANDOMIZE <n>
//   reportError(error: BasicRuntimeError): void | Promise<void>;
//   onStart?(programSource: string): void;
//   onEnd?(reason: 'end' | 'stop' | 'error'): void;
//   onLineEnter?(lineNumber: number): void;                // future step-debugging hook
// }
//
// export class BasicRuntimeError extends Error {
//   constructor(public code: BasicErrorCode, public line: number, message: string) { super(message); }
// }
// export type BasicErrorCode =
//   | 'SYNTAX' | 'TYPE_MISMATCH' | 'OVERFLOW' | 'DIVISION_BY_ZERO'
//   | 'SUBSCRIPT_OUT_OF_RANGE' | 'OUT_OF_DATA' | 'UNDEFINED_LINE'
//   | 'RETURN_WITHOUT_GOSUB' | 'NEXT_WITHOUT_FOR' | 'ILLEGAL_FUNCTION_CALL';

export {};
