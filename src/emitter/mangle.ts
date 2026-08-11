// Identifier -> safe runtime-object key encoding.
//
// TODO (build order step 3): BASIC variables/arrays are stored as
// string-keyed entries in the generated code's local V (scalars) / ARR
// (arrays) objects, never as bare JS identifiers — this sidesteps reserved-
// word collisions entirely (V['class'] is always legal). export function
// varKey(name: string, suffix: TypeSuffix): string, e.g. name + suffix.

export {};
