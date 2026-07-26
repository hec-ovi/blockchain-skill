import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (p: string) => readFileSync(join(root, p), "utf8");
const readJson = (p: string) => JSON.parse(read(p));

describe("distribution: manifests in lockstep", () => {
  const pkg = readJson("package.json");

  it("version matches across package.json, both plugin manifests and the marketplace", () => {
    expect(readJson("plugins/agent-wallet/.claude-plugin/plugin.json").version).toBe(pkg.version);
    expect(readJson("plugins/agent-wallet-codex/.codex-plugin/plugin.json").version).toBe(pkg.version);
    const market = readJson(".claude-plugin/marketplace.json");
    expect(market.metadata.version).toBe(pkg.version);
    expect(market.plugins[0].version).toBe(pkg.version);
  });

  it("plugin/marketplace name is agent-wallet and the marketplace points at the plugin dir", () => {
    expect(readJson("plugins/agent-wallet/.claude-plugin/plugin.json").name).toBe("agent-wallet");
    const market = readJson(".claude-plugin/marketplace.json");
    const plugin = market.plugins.find((p: any) => p.name === "agent-wallet");
    expect(plugin).toBeDefined();
    expect(plugin.source).toBe("./plugins/agent-wallet");
    const agents = readJson(".agents/plugins/marketplace.json");
    expect(agents.plugins[0].source.path).toBe("./plugins/agent-wallet-codex");
  });
});

describe("distribution: skills present and well-formed", () => {
  const skillsDir = join(root, "skills");
  const skills = readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, "SKILL.md")));

  it("ships the single fat skill at root, in skills/, and in both plugin dirs", () => {
    expect(skills).toEqual(["agent-wallet"]);
    for (const p of ["SKILL.md", "plugins/agent-wallet/skills/agent-wallet/SKILL.md", "plugins/agent-wallet-codex/skills/agent-wallet/SKILL.md"]) {
      expect(existsSync(join(root, p)), `${p} missing`).toBe(true);
      expect(read(p)).toBe(read("SKILL.md"));
    }
  });

  it("every SKILL.md has name + a pushy description in frontmatter", () => {
    for (const s of skills) {
      const body = read(`skills/${s}/SKILL.md`);
      const fm = body.match(/^---\n([\s\S]*?)\n---/);
      expect(fm, `${s} has no frontmatter`).toBeTruthy();
      expect(fm![1]).toMatch(/name:\s*\S+/);
      const desc = fm![1].match(/description:\s*(.+)/)?.[1] ?? "";
      expect(desc.length, `${s} description too short`).toBeGreaterThan(80);
      expect(desc.toLowerCase()).toContain("trigger");
    }
  });
});

describe("distribution: every layer contract is valid", () => {
  const layersDir = join(root, "layers");
  const layers = readdirSync(layersDir).filter((d) => existsSync(join(layersDir, d, "CONTRACT.md")));

  it("each layer has CONTRACT.md and a schema/ dir with at least one schema (except agentio)", () => {
    for (const l of layers) {
      expect(existsSync(join(layersDir, l, "CONTRACT.md"))).toBe(true);
      if (l === "agentio") continue;
      const schemaDir = join(layersDir, l, "schema");
      expect(existsSync(schemaDir), `${l} has no schema/`).toBe(true);
      expect(readdirSync(schemaDir).filter((f) => f.endsWith(".json")).length).toBeGreaterThan(0);
    }
  });

  it("every schema link in a CONTRACT.md resolves to a real file", () => {
    for (const l of layers) {
      const contract = read(`layers/${l}/CONTRACT.md`);
      for (const m of contract.matchAll(/\]\((schema\/[a-z0-9-]+\.json)\)/g)) {
        expect(existsSync(join(layersDir, l, m[1]!)), `${l} links missing ${m[1]}`).toBe(true);
      }
    }
  });
});

describe("distribution: bundled CLI for skill packs", () => {
  it("ships dist/agent-wallet.mjs and skill-root launcher", () => {
    expect(existsSync(join(root, "dist/agent-wallet.mjs"))).toBe(true);
    expect(existsSync(join(root, "agent-wallet"))).toBe(true);
    expect(existsSync(join(root, "bin/agent-wallet"))).toBe(true);
  });

  it("package bin points at the bundle", () => {
    const pkg = readJson("package.json");
    expect(pkg.bin["agent-wallet"]).toBe("dist/agent-wallet.mjs");
    expect(pkg.name).toBe("agent-wallet");
  });
});

describe("distribution: no em or en dashes in docs and manifests", () => {
  const targets = [
    "README.md",
    "docs/RESEARCH.md",
    "docs/ARCHITECTURE.md",
    "docs/INDEX.md",
    "SKILL.md",
    ".claude-plugin/marketplace.json",
    ".agents/plugins/marketplace.json",
    "plugins/agent-wallet/.claude-plugin/plugin.json",
    "plugins/agent-wallet-codex/.codex-plugin/plugin.json",
  ];

  it("shipped docs use plain hyphens only", () => {
    for (const t of targets) {
      const body = read(t);
      expect(body.includes("—"), `${t} has an em dash`).toBe(false);
      expect(body.includes("–"), `${t} has an en dash`).toBe(false);
    }
  });

  it("every SKILL.md, CONTRACT.md and reference is dash-clean", () => {
    const check = (dir: string, file: string) => {
      for (const d of readdirSync(join(root, dir))) {
        const base = join(root, dir, d);
        const main = join(base, file);
        if (existsSync(main)) {
          const body = readFileSync(main, "utf8");
          expect(body.includes("—") || body.includes("–"), `${dir}/${d}/${file} has a dash`).toBe(false);
        }
        const refs = join(base, "references");
        if (existsSync(refs)) {
          for (const r of readdirSync(refs)) {
            const body = readFileSync(join(refs, r), "utf8");
            expect(body.includes("—") || body.includes("–"), `${dir}/${d}/references/${r} has a dash`).toBe(false);
          }
        }
      }
    };
    check("skills", "SKILL.md");
    check("layers", "CONTRACT.md");
  });
});
