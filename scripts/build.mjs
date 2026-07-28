#!/usr/bin/env node
/**
 * Bundle the agent-wallet CLI into a single Node ESM file.
 * Output: dist/agent-wallet.mjs (only runtime dep: Node >= 22).
 *
 * Optional CDP x402 peer imports are stubbed: this toolkit uses the faucet
 * surface of @coinbase/cdp-sdk, not x402 payments.
 */
import * as esbuild from "esbuild";
import {
  readFileSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
  cpSync,
  rmSync,
  existsSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const outfile = join(root, "dist", "agent-wallet.mjs");

/** solc cannot be esbuild-bundled cleanly (dynamic requires). Ship it beside the CLI. */
function vendorSolc() {
  const vendorNm = join(root, "dist", "vendor", "node_modules");
  rmSync(join(root, "dist", "vendor"), { recursive: true, force: true });
  mkdirSync(vendorNm, { recursive: true });
  const pkgs = [
    "solc",
    "command-exists",
    "commander",
    "follow-redirects",
    "js-sha3",
    "memorystream",
    "semver",
    "tmp",
    "os-tmpdir",
  ];
  for (const name of pkgs) {
    const src = join(root, "node_modules", name);
    if (!existsSync(src)) {
      throw new Error(`build: missing dependency ${name} (npm install first)`);
    }
    cpSync(src, join(vendorNm, name), { recursive: true });
  }
  console.log(`vendored solc (+deps) -> dist/vendor/node_modules`);
}

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
  // Some transitive CJS deps (debug, via @ethereumjs/*) call require() for node
  // builtins at load time. ESM output has no require, so give it a real one.
  banner: {
    js: "import { createRequire as __agentWalletCreateRequire } from 'node:module';\nconst require = __agentWalletCreateRequire(import.meta.url);",
  },
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

vendorSolc();

const mb = (readFileSync(outfile).byteLength / (1024 * 1024)).toFixed(2);
console.log(`built dist/agent-wallet.mjs v${pkg.version} (${mb} MiB)`);
