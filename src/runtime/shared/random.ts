// Seedable PRNG backing RND / RANDOMIZE.
//
// TODO (build order step 14): implement a small seedable PRNG (e.g.
// mulberry32). NOT bit-compatible with real GW-BASIC's RNG sequence — see
// DIALECT.md's locked "Edge-case defaults". Unseeded programs seed from
// wall-clock time; golden tests using RND must call RANDOMIZE <fixed-seed>
// for determinism.

export {};
