import { describe, it } from "vitest";

// Full funded live e2e needs an externally funded wallet. Not wired to any
// built-in drip. Opt-in read/quote checks: layers/*/tests/*.live.test.ts with RUN_LIVE=1.
describe.skip("real network funded e2e (external funding required)", () => {
  it("placeholder", () => {
    /* intentionally empty */
  });
});
