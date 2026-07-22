import { run, type Envelope } from "../../core/src/envelope.ts";
import { cdpFaucet, type FaucetDrip, type FaucetToken } from "./cdp.ts";

const LAYER = { layer: "faucet", backend: "cdp" };

export interface FaucetRequest {
  address: string;
  network: string;
  token?: FaucetToken;
}

/** Load free test credits into an address on a public testnet, headless via CDP. */
export function faucet(req: FaucetRequest): Promise<Envelope<FaucetDrip>> {
  return run({ ...LAYER, chain: req.network }, () => cdpFaucet(req.address, req.network, req.token ?? "eth"));
}
