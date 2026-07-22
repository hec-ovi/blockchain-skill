import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

const layersDir = fileURLToPath(new URL("../layers/", import.meta.url));

export function renderSchema(layer: string, name: string, schema: z.ZodType): string {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  json["$id"] = `https://github.com/hec-ovi/blockchain-skill/layers/${layer}/schema/${name}.json`;
  return `${JSON.stringify(json, null, 2)}\n`;
}

export async function collectContracts(): Promise<Array<{ layer: string; name: string; rendered: string }>> {
  const out: Array<{ layer: string; name: string; rendered: string }> = [];
  for (const layer of readdirSync(layersDir).sort()) {
    const contractPath = join(layersDir, layer, "src", "contract.ts");
    if (!existsSync(contractPath)) continue;
    const mod = await import(pathToFileURL(contractPath).href);
    for (const [name, schema] of Object.entries(mod.schemas as Record<string, z.ZodType>)) {
      out.push({ layer, name, rendered: renderSchema(layer, name, schema) });
    }
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const { layer, name, rendered } of await collectContracts()) {
    const outDir = join(layersDir, layer, "schema");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${name}.json`), rendered);
    console.log(`layers/${layer}/schema/${name}.json`);
  }
}
