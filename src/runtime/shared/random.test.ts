import { describe, expect, it } from "vitest";
import { mulberry32, SeedableRandom } from "./random.js";

describe("mulberry32", () => {
  it("produces values in [0, 1)", () => {
    const next = mulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("is deterministic: the same seed produces the same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
});

describe("SeedableRandom", () => {
  it("re-seeding produces the same sequence as a fresh generator with that seed", () => {
    const rng = new SeedableRandom(1);
    rng.next();
    rng.next();
    rng.seed(99);
    const afterReseed = [rng.next(), rng.next()];

    const fresh = mulberry32(99);
    expect(afterReseed).toEqual([fresh(), fresh()]);
  });

  it("defaults to some seed when none is given (doesn't throw, produces valid values)", () => {
    const rng = new SeedableRandom();
    const value = rng.next();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });
});
