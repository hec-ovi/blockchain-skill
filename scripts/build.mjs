#!/usr/bin/env node
/**
 * Bundle the agent-wallet CLI into a single Node ESM file.
 * Output: dist/agent-wallet.mjs (only runtime dep: Node >= 22).
 *
 * Optional CDP x402 peer imports are stubbed: this toolkit uses the faucet
 * surface of @coinbase/cdp-sdk, not x402 payments.
 */
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const outfile = join(root, "dist", "agent-wallet.mjs");

const stubPlugin = {
  name: "stub-optional-x402",
  setup(build) {
    const stubs = [
      "@x402/core/client",
      "@x402/evm/exact/client",
      "@x402/evm/upto/client",
      "@x402/svm/exact/client",
      "@x402/evm",
    ];
    for (const id of stubs) {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      build.onResolve({ filter: new RegExp(`^${escaped}$`) }, () => ({
        path: id,
        namespace: "x402-stub",
      }));
    }
    build.onLoad({ filter: /.*/, namespace: "x402-stub" }, () => ({
      contents:
        'export default {};\nexport function toClientEvmSigner() { throw new Error("x402 is not included in the agent-wallet bundle"); }\n',
      loader: "js",
    }));
  },
};

mkdirSync(join(root, "dist"), { recursive: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(root, "bin", "entry.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile,
  logLevel: "info",
  plugins: [stubPlugin],
  define: {
    "process.env.AGENT_WALLET_BUNDLED_VERSION": JSON.stringify(pkg.version),
  },
  // Keep source maps out of the shipped artifact; agents run the mjs only.
  sourcemap: false,
  legalComments: "none",
});

let body = readFileSync(outfile, "utf8");
// Node strips only the first leading shebang; collapse any from source files.
body = body.replace(/^(#!.*\n)+/, "");
writeFileSync(outfile, `#!/usr/bin/env node\n${body}`);
chmodSync(outfile, 0o755);

const mb = (readFileSync(outfile).byteLength / (1024 * 1024)).toFixed(2);
console.log(`built dist/agent-wallet.mjs v${pkg.version} (${mb} MiB)`);
