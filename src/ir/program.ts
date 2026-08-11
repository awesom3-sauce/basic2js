// Intermediate representation: a flat, statement-granularity step list plus
// a line-number -> step-index map, the input to the emitter.
//
// TODO (build order step 3): export interface Step { ... } (one per
// statement, tagged with its originating BASIC line number for error
// reporting) and export type LineIndex = Map<number, number> (lineToStep).

export {};
