import { run, type Envelope } from "../../core/src/envelope.ts";
import { signEvmMessage, signEvmTx, signEvmTypedData, type EvmMessageSigned, type EvmSignRequest, type EvmSigned } from "./evm.ts";
import { signBtcTx, type BtcSignRequest, type BtcSigned } from "./btc.ts";

const LAYER = { layer: "sign", backend: "local" };

export function evmTxSign(req: EvmSignRequest): Promise<Envelope<EvmSigned>> {
  return run({ ...LAYER, chain: String(req.chainId) }, () => signEvmTx(req));
}

export function evmMessageSign(wallet: string, passphrase: string, index: number, message: string): Promise<Envelope<EvmMessageSigned>> {
  return run(LAYER, () => signEvmMessage(wallet, passphrase, index, message));
}

export function evmTypedDataSign(wallet: string, passphrase: string, index: number, typedJson: string): Promise<Envelope<EvmMessageSigned>> {
  return run(LAYER, () => signEvmTypedData(wallet, passphrase, index, typedJson));
}

export function btcTxSign(req: BtcSignRequest): Promise<Envelope<BtcSigned>> {
  return run({ ...LAYER, chain: req.network }, () => signBtcTx(req));
}
