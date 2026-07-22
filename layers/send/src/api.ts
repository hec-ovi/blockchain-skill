import { run, type Envelope } from "../../core/src/envelope.ts";
import { sendEvm, type EvmSendRequest, type EvmSendResult } from "./evm.ts";
import { sendBtc, type BtcSendRequest, type BtcSendResult } from "./btc.ts";
import { resolveChain } from "../../chains/src/registry.ts";

const LAYER = { layer: "send", backend: "auto" };

export type SendRequest = (EvmSendRequest | BtcSendRequest) & { chain: string };

export function send(req: SendRequest): Promise<Envelope<EvmSendResult | BtcSendResult>> {
  return run({ ...LAYER, chain: req.chain }, async () => {
    const info = await resolveChain(req.chain, (req as EvmSendRequest).fetchFn);
    return info.family === "btc" ? sendBtc(req as BtcSendRequest) : sendEvm(req as EvmSendRequest);
  });
}
