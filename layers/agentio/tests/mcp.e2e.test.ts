import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN = new URL("../../../bin/agent-wallet.ts", import.meta.url).pathname;

/** Minimal stdio JSON-RPC client for one MCP server process. */
class McpClient {
  private buf = "";
  private pending = new Map<number, (msg: any) => void>();
  private id = 0;
  private proc: ChildProcessWithoutNullStreams;
  constructor(proc: ChildProcessWithoutNullStreams) {
    this.proc = proc;
    proc.stdout.on("data", (chunk) => {
      this.buf += chunk.toString();
      let nl: number;
      while ((nl = this.buf.indexOf("\n")) >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            this.pending.get(msg.id)!(msg);
            this.pending.delete(msg.id);
          }
        } catch {
          /* not a json line */
        }
      }
    });
  }
  request(method: string, params: unknown): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, resolve);
      this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      setTimeout(() => reject(new Error(`timeout on ${method}`)), 15000).unref();
    });
  }
  notify(method: string, params: unknown): void {
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }
}

describe("MCP server over real stdio", () => {
  let proc: ChildProcessWithoutNullStreams;
  let client: McpClient;
  let home: string;

  beforeAll(async () => {
    home = mkdtempSync(join(tmpdir(), "agent-wallet-mcp-"));
    proc = spawn(process.execPath, [BIN, "mcp"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, AGENT_WALLET_HOME: home, AGENT_WALLET_PASSPHRASE: "mcp-test-pass", AGENT_WALLET_SCRYPT_N: "1024" },
    }) as ChildProcessWithoutNullStreams;
    client = new McpClient(proc);
    await client.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    client.notify("notifications/initialized", {});
  }, 30000);

  afterAll(() => {
    proc?.kill("SIGKILL");
    rmSync(home, { recursive: true, force: true });
  });

  it("lists the wallet, read, contract, swap and bridge tools", async () => {
    const res = await client.request("tools/list", {});
    const names = res.result.tools.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(["wallet_create", "wallet_addresses", "balance", "send", "contract_deploy", "contract_call", "swap", "bridge", "bridge_status"]));
    // every tool carries a non-trivial description (context engineering)
    for (const t of res.result.tools) expect(t.description.length).toBeGreaterThan(40);
  });

  it("wallet_create returns the same envelope shape the CLI emits", async () => {
    const res = await client.request("tools/call", { name: "wallet_create", arguments: { name: "mcp", words: "12" } });
    const env = JSON.parse(res.result.content[0].text);
    expect(env.ok).toBe(true);
    expect(env.meta.layer).toBe("keys");
    expect(env.data.mnemonic.split(" ")).toHaveLength(12);
    expect(env.data.evmAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
  }, 20000);

  it("gate denial surfaces through the tool as a normal envelope", async () => {
    await client.request("tools/call", { name: "wallet_create", arguments: { name: "gated" } });
    const res = await client.request("tools/call", { name: "send", arguments: { chain: "ethereum", to: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", amount: "0.1", wallet: "gated" } });
    const env = JSON.parse(res.result.content[0].text);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("GATE_DENIED");
    expect(env.error.hint).toContain("allowMainnet");
  }, 20000);
});
