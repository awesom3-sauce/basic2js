// String builtin implementations: LEFT$, RIGHT$, MID$, LEN, CHR$, ASC,
// STR$, VAL, INSTR.
//
// TODO (build order step 14, with unit tests for edge cases): MID$ with
// omitted length, INSTR-not-found returning 0 (not -1, per BASIC
// convention), VAL on malformed/leading-whitespace input, ASC on empty
// string (error), CHR$ out-of-range codes.

export {};
