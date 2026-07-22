import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findBin, randomPort, waitFor } from "./bins.ts";

export interface RegtestHandle {
  rpcUrl: string;
  rpc(method: string, params?: unknown[]): Promise<any>;
  mine(blocks: number, toAddress: string): Promise<string[]>;
  stop(): Promise<void>;
}

/** Spawns a throwaway bitcoind regtest node with basic-auth RPC. */
export async function startRegtest(): Promise<RegtestHandle> {
  const bin = findBin("bitcoind");
  if (!bin) throw new Error("bitcoind not found; install Bitcoin Core");
  const datadir = mkdtempSync(join(tmpdir(), "agent-wallet-regtest-"));
  const rpcPort = randomPort();
  const p2pPort = randomPort();
  const child: ChildProcess = spawn(
    bin,
    [
      "-regtest",
      `-datadir=${datadir}`,
      `-rpcport=${rpcPort}`,
      `-port=${p2pPort}`,
      "-rpcuser=test",
      "-rpcpassword=test",
      "-fallbackfee=0.0001",
      "-txindex=1",
      "-listen=0",
    ],
    { stdio: "ignore" },
  );
  const rpcUrl = `http://test:test@127.0.0.1:${rpcPort}`;

  async function rpc(method: string, params: unknown[] = []): Promise<any> {
    const res = await fetch(`http://127.0.0.1:${rpcPort}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from("test:test").toString("base64")}`,
      },
      body: JSON.stringify({ jsonrpc: "1.0", id: "testkit", method, params }),
    });
    const body: any = await res.json();
    if (body.error) throw new Error(`bitcoind ${method}: ${JSON.stringify(body.error)}`);
    return body.result;
  }

  await waitFor(async () => (await rpc("getblockcount")) >= 0, 30000);

  return {
    rpcUrl,
    rpc,
    mine: (blocks, toAddress) => rpc("generatetoaddress", [blocks, toAddress]),
    stop: () =>
      new Promise<void>((resolve) => {
        child.once("exit", () => {
          rmSync(datadir, { recursive: true, force: true });
          resolve();
        });
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000).unref();
      }),
  };
}
