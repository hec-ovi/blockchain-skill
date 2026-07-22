import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { collectContracts } from "../../../scripts/export-schemas.ts";

const layersDir = fileURLToPath(new URL("../../../layers/", import.meta.url));

describe("published JSON Schemas", () => {
  it("every layer contract matches its committed schema file (no drift)", async () => {
    const contracts = await collectContracts();
    expect(contracts.length).toBeGreaterThan(0);
    for (const { layer, name, rendered } of contracts) {
      const committed = readFileSync(join(layersDir, layer, "schema", `${name}.json`), "utf8");
      expect(committed, `layers/${layer}/schema/${name}.json is stale; run npm run schemas`).toBe(rendered);
    }
  });

  it("schemas carry a stable $id and 2020-12 dialect", async () => {
    for (const { layer, name, rendered } of await collectContracts()) {
      const json = JSON.parse(rendered);
      expect(json["$id"]).toBe(`https://github.com/hec-ovi/blockchain-skill/layers/${layer}/schema/${name}.json`);
      expect(json["$schema"]).toContain("2020-12");
    }
  });
});
