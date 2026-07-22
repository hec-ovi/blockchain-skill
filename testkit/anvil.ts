import { spawn, type ChildProcess } from "node:child_process";
import { findBin, randomPort, waitFor } from "./bins.ts";

export interface AnvilHandle {
  url: string;
  port: number;
  chainId: number;
  stop(): Promise<void>;
}

/** Spawns a throwaway anvil node (chain id 31337, 10 funded dev accounts). */
export async function startAnvil(extraArgs: string[] = []): Promise<AnvilHandle> {
  const bin = findBin("anvil");
  if (!bin) throw new Error("anvil not found; install foundry (foundryup)");
  const port = randomPort();
  const child: ChildProcess = spawn(bin, ["--port", String(port), "--silent", ...extraArgs], { stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  await waitFor(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return res.ok;
  });
  return {
    url,
    port,
    chainId: 31337,
    stop: () =>
      new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 3000).unref();
      }),
  };
}
