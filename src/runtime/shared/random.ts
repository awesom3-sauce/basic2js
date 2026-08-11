// Seedable PRNG backing RND / RANDOMIZE (build order step 14).
//
// Genuinely shared (unlike strings.ts/math.ts's builtins — see their
// header comments): `random()`/`seedRandom()` are BasicRuntime host
// methods (runtime/interface.ts), called BY emitted code rather than
// implemented inside it, since real entropy has to come from the host, the
// same way real GW-BASIC's RND ultimately reads real hardware/OS state.
// Every BasicRuntime implementation (NodeRuntime, the future
// BrowserRuntime, TestRuntime) delegates to SeedableRandom here, so they
// all share one deterministic-when-seeded algorithm instead of each
// hand-rolling its own.
//
// mulberry32 (public-domain, widely used for small deterministic JS PRNGs)
// — chosen for being tiny and dependency-free, NOT for matching any real
// GW-BASIC RNG sequence bit-for-bit. See DIALECT.md's Open Decisions:
// golden tests that use RND must call RANDOMIZE <fixed-seed> for
// determinism; never assert against real-hardware GW-BASIC output.

export type Prng = () => number;

/** A mulberry32 generator seeded with `seed`, producing 0 <= x < 1 on each call. */
export function mulberry32(seed: number): Prng {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mutable holder for a `BasicRuntime`'s current PRNG state — `seed()`
 * re-seeds (backing `RANDOMIZE`), `next()` draws the next value (backing
 * `RND`). Defaults to a wall-clock-derived seed if never explicitly
 * seeded, matching real BASIC's "unseeded RND still varies run to run"
 * behavior — callers that need determinism without an explicit
 * `RANDOMIZE` (e.g. TestRuntime, so accidentally-unseeded tests fail the
 * same way twice rather than flaking) should pass a fixed seed explicitly.
 */
export class SeedableRandom {
  private prng: Prng;

  constructor(initialSeed: number = Date.now()) {
    this.prng = mulberry32(initialSeed);
  }

  seed(seed: number): void {
    this.prng = mulberry32(seed);
  }

  next(): number {
    return this.prng();
  }
}
