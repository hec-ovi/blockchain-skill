import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { modes, status, step } from "../src/api.ts";
import { renderStep, MAX_VISITS } from "../src/walk.ts";
import { modeListOutput, stepOutput, walkStatusOutput } from "../src/contract.ts";
import { MANIFEST, PARAMETERS, PROMPTS } from "../src/prompts.generated.ts";
import { buildModule } from "../../../scripts/export-prompts.ts";

const generated = fileURLToPath(new URL("../src/prompts.generated.ts", import.meta.url));

let work: string;
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "contract-walk-"));
  process.env["AGENT_CONTRACT_WORK"] = work;
});
afterEach(() => {
  delete process.env["AGENT_CONTRACT_WORK"];
  rmSync(work, { recursive: true, force: true });
});

const sequence = (mode: string): string[] => MANIFEST.modes[mode] ?? [];

/** Satisfy the artifact gate for every producing step up to (not including) `stop`. */
function fulfilUpTo(mode: string, stop: string): void {
  for (const key of sequence(mode)) {
    if (key === stop) return;
    const artifact = MANIFEST.produces[key];
    if (artifact) writeFileSync(join(work, artifact), "done\n");
  }
}

describe("workflow: one step at a time", () => {
  it("serves the mode picker when no mode is chosen", async () => {
    const env = await step();
    const data = stepOutput.parse(env.data);
    expect(data.step).toBe("00-mode");
    expect(data.body).toContain("Which workflow are you running?");
    expect(data.nextCommand).toContain("--mode");
  });

  it("serves the first step of a mode and names its artifact", async () => {
    const env = await step({ mode: "build" });
    const data = stepOutput.parse(env.data);
    expect(data.step).toBe("10-spec");
    expect(data.index).toBe(1);
    expect(data.total).toBe(sequence("build").length);
    expect(data.artifact).toBe(join(work, "spec.md"));
    expect(data.next).toBe("20-threat");
  });

  it("blocks a step whose predecessors have not produced their artifacts", async () => {
    await step({ mode: "build" });
    const env = await step({ mode: "build", step: "40-implement" });
    expect(env.error?.code).toBe("WALK_BLOCKED");
    expect(env.error?.hint).toContain("10-spec");
  });

  it("advances once the artifact exists", async () => {
    await step({ mode: "build" });
    writeFileSync(join(work, "spec.md"), "# spec\n");
    const env = await step({ mode: "build", step: "20-threat" });
    const data = stepOutput.parse(env.data);
    expect(data.step).toBe("20-threat");
    expect(data.index).toBe(2);
  });

  it("counts visits and cuts off a loop", async () => {
    await step({ mode: "build" });
    for (let i = 1; i < MAX_VISITS; i++) {
      const env = await step({ mode: "build", step: "10-spec" });
      expect(stepOutput.parse(env.data).visits).toBe(i + 1);
    }
    const blown = await step({ mode: "build", step: "10-spec" });
    expect(blown.error?.code).toBe("WALK_LOOPING");
    expect(blown.error?.hint).toContain("Report to the human");
  });

  it("resumes an in-progress walk instead of wiping it", async () => {
    // An agent told to "finish the walk" reaches for --mode, and that must not
    // destroy the artifacts it already produced.
    await step({ mode: "build" });
    writeFileSync(join(work, "spec.md"), "# spec\n");
    writeFileSync(join(work, "threat.md"), "# threat\n");

    const env = await step({ mode: "build" });
    const data = stepOutput.parse(env.data);
    expect(data.step).toBe("30-design");
    expect(readFileSync(join(work, "spec.md"), "utf8")).toBe("# spec\n");
  });

  it("clears the work dir on an explicit reset", async () => {
    await step({ mode: "build" });
    writeFileSync(join(work, "spec.md"), "stale\n");
    await step({ mode: "build", reset: true });
    expect(existsSync(join(work, "spec.md"))).toBe(false);
    const env = await step({ mode: "build", step: "20-threat" });
    expect(env.error?.code).toBe("WALK_BLOCKED");
  });

  it("starts fresh when the previous walk was a different mode", async () => {
    await step({ mode: "build" });
    writeFileSync(join(work, "spec.md"), "from a build walk\n");
    const env = await step({ mode: "review" });
    expect(stepOutput.parse(env.data).step).toBe("10-target");
    expect(existsSync(join(work, "spec.md"))).toBe(false);
  });

  it("keeps the walk when resuming a specific step", async () => {
    await step({ mode: "build" });
    writeFileSync(join(work, "spec.md"), "# spec\n");
    await step({ mode: "build", step: "20-threat" });
    const again = await step({ mode: "build", step: "20-threat" });
    expect(stepOutput.parse(again.data).visits).toBe(2);
    expect(readFileSync(join(work, "spec.md"), "utf8")).toBe("# spec\n");
  });

  it("rejects an unknown mode, an unknown step, and a step outside its mode", async () => {
    expect((await step({ mode: "nope" })).error?.code).toBe("MODE_UNKNOWN");
    expect((await step({ mode: "build", step: "42-nope" })).error?.code).toBe("STEP_NOT_IN_MODE");
    expect((await step({ mode: "review", step: "40-implement" })).error?.code).toBe("STEP_NOT_IN_MODE");
    expect((await step({ step: "10-spec" })).error?.code).toBe("MODE_REQUIRED");
  });

  it("runs the review and ship modes end to end", async () => {
    for (const mode of ["review", "ship"] as const) {
      rmSync(work, { recursive: true, force: true });
      const seq = sequence(mode);
      await step({ mode });
      for (const key of seq) {
        fulfilUpTo(mode, key);
        const env = await step({ mode, step: key });
        const data = stepOutput.parse(env.data);
        expect(data.body.length).toBeGreaterThan(200);
        expect(data.mode).toBe(mode);
      }
      const last = await step({ mode, step: seq[seq.length - 1]! });
      expect(stepOutput.parse(last.data).next).toBeUndefined();
    }
  });

  it("reports where the walk stands", async () => {
    await step({ mode: "build" });
    writeFileSync(join(work, "spec.md"), "# spec\n");
    const env = await status();
    const data = walkStatusOutput.parse(env.data);
    expect(data.mode).toBe("build");
    expect(data.steps[0]).toMatchObject({ step: "10-spec", saved: true, visits: 1 });
    expect(data.blockedBy).toBe("20-threat");
  });

  it("lists every mode with its purpose", async () => {
    const data = modeListOutput.parse((await modes()).data);
    expect(data.modes.map((m) => m.mode).sort()).toEqual(["build", "review", "ship"]);
    for (const m of data.modes) expect(m.purpose.length).toBeGreaterThan(20);
  });

  it("renders a step the way an agent reads it", async () => {
    const data = stepOutput.parse((await step({ mode: "build" })).data);
    const text = renderStep(data);
    expect(text).toMatch(/^STEP 10-spec {2}\[build, node 1 of \d+\]/);
    expect(text).toContain(`WORK DIR: ${work}`);
    expect(text).toContain("ARTIFACT:");
    expect(text).toContain("NEXT: agent-wallet contract-step --mode build --step 20-threat");
  });
});

describe("prompt content", () => {
  it("the generated module matches the prompt files (run npm run prompts)", () => {
    expect(readFileSync(generated, "utf8")).toBe(buildModule());
  });

  it("every step in every mode has a prompt, and every prompt is used", () => {
    const used = new Set(Object.values(MANIFEST.modes).flat());
    used.add("00-mode");
    for (const key of used) expect(PROMPTS[key], `missing prompt ${key}`).toBeDefined();
    for (const key of Object.keys(PROMPTS)) expect(used.has(key), `orphan prompt ${key}`).toBe(true);
  });

  it("every produces entry belongs to a real step", () => {
    const known = new Set(Object.keys(PROMPTS));
    for (const key of Object.keys(MANIFEST.produces)) expect(known.has(key), `produces names unknown step ${key}`).toBe(true);
  });

  it("substitutes every parameter placeholder", async () => {
    for (const key of Object.keys(PROMPTS)) {
      const mode = Object.entries(MANIFEST.modes).find(([, steps]) => (steps as string[]).includes(key))?.[0];
      if (!mode) continue;
      fulfilUpTo(mode, key);
      const data = stepOutput.parse((await step({ mode, step: key })).data);
      expect(data.body, `${key} has an unsubstituted placeholder`).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
    }
    expect(PARAMETERS["SOLC_VERSION"]).toMatch(/^0\.8\./);
  });

  it("keeps em and en dashes out of the prompts", () => {
    for (const [key, body] of Object.entries(PROMPTS)) {
      expect(body, `${key} contains an em or en dash`).not.toMatch(/[–—]/);
    }
  });

  it("carries the load-bearing safety rules", () => {
    expect(PROMPTS["60-audit"]).toMatch(/PASS only when all ten dimensions pass/);
    expect(PROMPTS["95-deploy"]).toMatch(/mainnet/i);
    expect(PROMPTS["70-fix"]).toMatch(/Fix the contract, not the test|Loosening an assertion/);
    expect(PROMPTS["55-sandbox"]).toMatch(/Fix the contract, not the test/);
    expect(PROMPTS["50-invariants"]).toMatch(/access-controlled function called by the wrong person/i);
  });
});
