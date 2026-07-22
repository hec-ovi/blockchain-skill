import { CodedError, run, type Envelope } from "../../core/src/envelope.ts";
import { loadConfig } from "../../core/src/config.ts";
import { resolveChain, type FetchLike } from "../../chains/src/registry.ts";
import { assertContractAddress, fromBlockscout, fromEtherscan, fromSourcify, type ContractSource } from "./sources.ts";
import { fromBytecode } from "./whatsabi.ts";

const LAYER = { layer: "learn", backend: "multi" };

export interface LearnQuery {
  chain: string;
  address: string;
  rpc?: string;
  /** skip the unverified-bytecode fallback */
  verifiedOnly?: boolean;
  fetchFn?: FetchLike;
}

function etherscanKey(): string | undefined {
  const cfg = (loadConfig()["learn"] ?? {}) as { etherscanApiKey?: string };
  const key = cfg.etherscanApiKey ?? process.env["ETHERSCAN_API_KEY"];
  return key && key.length > 0 ? key : undefined;
}

/**
 * Fetch a contract's ABI/source, keyless-first: Sourcify, then Blockscout,
 * then Etherscan v2 (if a key exists), then WhatsABI from bytecode.
 */
export function learnContract(q: LearnQuery): Promise<Envelope<ContractSource>> {
  return run({ ...LAYER, chain: q.chain }, async () => {
    const address = assertContractAddress(q.address);
    const info = await resolveChain(q.chain, q.fetchFn);
    if (info.family !== "evm") {
      throw new CodedError("FAMILY_MISMATCH", "contract intelligence is EVM-only", "Bitcoin has no on-chain contract ABIs");
    }
    const fetchFn = q.fetchFn ?? fetch;

    const sourcify = await fromSourcify(fetchFn, info.chainId, address);
    if (sourcify) return sourcify;

    const blockscout = await fromBlockscout(fetchFn, info, address);
    if (blockscout) return blockscout;

    const key = etherscanKey();
    if (key) {
      const etherscan = await fromEtherscan(fetchFn, info.chainId, address, key);
      if (etherscan) return etherscan;
    }

    if (q.verifiedOnly) {
      throw new CodedError(
        "NOT_VERIFIED",
        `no verified source for ${address} on ${info.name}`,
        "Drop verifiedOnly to guess an ABI from bytecode, or set learn.etherscanApiKey in config.json to widen the search",
      );
    }

    const guessed = await fromBytecode(info, address, q.rpc);
    if (guessed) return guessed;

    throw new CodedError("NO_CONTRACT", `no contract code at ${address} on ${info.name}`, "Is this an externally-owned account, or the wrong chain?");
  });
}
