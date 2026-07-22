import { describe, expect, it } from "vitest";
import { CONTRACT_VERSION, envelopeShape, fail, mustValidate, ok } from "../src/envelope.ts";

describe("envelope", () => {
  it("ok() produces a valid envelope with data and no error", () => {
    const env = ok({ layer: "core", backend: "test", chain: "sepolia" }, { hello: 1 });
    const parsed = envelopeShape.parse(env);
    expect(parsed.ok).toBe(true);
    expect(parsed.error).toBeUndefined();
    expect(env.data).toEqual({ hello: 1 });
    expect(env.meta.chain).toBe("sepolia");
    expect(env.meta.traceId).toMatch(/[0-9a-f-]{36}/);
    expect(env.contractVersion).toBe(CONTRACT_VERSION);
  });

  it("fail() produces a valid envelope with a coded error and hint", () => {
    const env = fail({ layer: "gate", backend: "policy" }, "GATE_DENIED", "mainnet not allowed", "edit config.json allowlist");
    const parsed = envelopeShape.parse(env);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toEqual({ code: "GATE_DENIED", message: "mainnet not allowed", hint: "edit config.json allowlist" });
  });

  it("rejects ok=true with an error attached (XOR)", () => {
    const bad = { ...ok({ layer: "core", backend: "test" }, null), error: { code: "X", message: "y" } };
    expect(envelopeShape.safeParse(bad).success).toBe(false);
  });

  it("rejects ok=false without an error (XOR)", () => {
    const env = fail({ layer: "core", backend: "test" }, "SOME_ERROR", "boom");
    const { error: _drop, ...bad } = env;
    expect(envelopeShape.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown top-level keys and lowercase error codes", () => {
    const env = ok({ layer: "core", backend: "test" }, 1);
    expect(envelopeShape.safeParse({ ...env, extra: true }).success).toBe(false);
    const bad = fail({ layer: "core", backend: "test" }, "OK", "m");
    (bad.error as any).code = "lowercase";
    expect(envelopeShape.safeParse(bad).success).toBe(false);
  });

  it("allows extra meta keys (open meta, strict envelope)", () => {
    const env = ok({ layer: "core", backend: "test" }, 1);
    (env.meta as any).rpcUrl = "https://example.org";
    expect(envelopeShape.safeParse(env).success).toBe(true);
  });

  it("mustValidate throws SCHEMA_INVALID with path detail", () => {
    expect(() => mustValidate(envelopeShape, { ok: true }, "core.test")).toThrowError(/SCHEMA_INVALID at core.test/);
  });

  it("measures elapsedMs from startedAt", () => {
    const env = ok({ layer: "core", backend: "test", startedAt: performance.now() - 5 }, null);
    expect(env.meta.elapsedMs).toBeGreaterThanOrEqual(4);
  });
});
