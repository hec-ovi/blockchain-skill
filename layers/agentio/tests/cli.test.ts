import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

const ENTRY = new URL("../../../bin/entry.ts", import.meta.url).pathname;

function cli(...args: string[]): { out: string; code: number } {
  try {
    return { out: execFileSync(process.execPath, [ENTRY, ...args], { encoding: "utf8" }), code: 0 };
  } catch (e: any) {
    return { out: `${e.stdout ?? ""}${e.stderr ?? ""}`, code: e.status ?? 1 };
  }
}

describe("agent-wallet CLI entry", () => {
  it("prints the package version", () => {
    const pkg = JSON.parse(execFileSync("cat", ["package.json"], { encoding: "utf8" }));
    expect(cli("version").out.trim()).toBe(pkg.version);
  });

  it("lists verbs on help including init", () => {
    const { out } = cli("help");
    expect(out).toContain("agent-wallet <verb>");
    expect(out).toContain("version");
    expect(out).toContain("init");
  });

  it("fails closed on unknown verbs with a steering hint", () => {
    const { out, code } = cli("frobnicate");
    expect(code).toBe(2);
    const env = JSON.parse(out);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("UNKNOWN_VERB");
    expect(env.error.hint).toContain("help");
  });

  it("init verb returns JSON ready report", () => {
    const { out, code } = cli("init");
    expect(code).toBe(0);
    const env = JSON.parse(out);
    expect(env.ok).toBe(true);
    expect(typeof env.data.ready).toBe("boolean");
    expect(Array.isArray(env.data.nextActions)).toBe(true);
  });
});
