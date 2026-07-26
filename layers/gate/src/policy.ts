import { z } from "zod";
import { CodedError } from "../../core/src/envelope.ts";
import { loadConfig } from "../../core/src/config.ts";

export const OPERATION_KINDS = ["send", "sign", "deploy", "contract-write", "swap"] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

export const gateConfigSchema = z
  .object({
    allowMainnet: z.boolean().default(true),
    allowedChains: z.array(z.union([z.number().int(), z.string()])).default([]),
    maxValueWei: z.string().regex(/^\d+$/).nullable().default(null),
    maxAmountSats: z.string().regex(/^\d+$/).nullable().default(null),
  })
  .strict();

export type GateConfig = z.infer<typeof gateConfigSchema>;

export interface OperationRequest {
  kind: string;
  chain: { family: "evm" | "btc"; name: string; testnet: boolean; chainId?: number; network?: string };
  /** native amount in base units (wei or sats); omit for value-free operations */
  valueBaseUnits?: string;
}

export interface GateVerdict {
  allowed: true;
  kind: OperationKind;
  chain: string;
  mainnet: boolean;
  policy: { allowMainnet: boolean; capApplied: string | null };
}

export function loadGateConfig(): GateConfig {
  const raw = (loadConfig()["gate"] ?? {}) as Record<string, unknown>;
  const parsed = gateConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CodedError("GATE_CONFIG_INVALID", `config.json gate section is malformed: ${parsed.error.issues[0]?.message ?? "unknown"}`, "Fix or delete the gate section");
  }
  return parsed.data;
}

/**
 * Deterministic allow/deny. Mainnet is allowed by default. Set
 * gate.allowMainnet=false (and optionally allowedChains) to lock mainnets down.
 * Unknown kinds and cap breaches still deny with an actionable hint.
 */
export function decide(op: OperationRequest, cfg: GateConfig = loadGateConfig()): GateVerdict {
  if (!(OPERATION_KINDS as readonly string[]).includes(op.kind)) {
    throw new CodedError("GATE_UNKNOWN_KIND", `operation kind "${op.kind}" is not gated, so it is denied`, `Known kinds: ${OPERATION_KINDS.join(", ")}`);
  }
  const kind = op.kind as OperationKind;
  const chainKey = op.chain.family === "evm" ? op.chain.chainId : op.chain.network;
  const explicitlyAllowed = cfg.allowedChains.some((c) => String(c) === String(chainKey));

  if (!op.chain.testnet && !cfg.allowMainnet && !explicitlyAllowed) {
    throw new CodedError(
      "GATE_DENIED",
      `${kind} on ${op.chain.name} is blocked: mainnet is disabled in config`,
      `To allow, edit $AGENT_WALLET_HOME/config.json: set {"gate":{"allowMainnet":true}} or add ${JSON.stringify(chainKey)} to gate.allowedChains`,
    );
  }

  let capApplied: string | null = null;
  if (op.valueBaseUnits !== undefined) {
    if (!/^\d+$/.test(op.valueBaseUnits)) {
      throw new CodedError("AMOUNT_INVALID", `valueBaseUnits must be a decimal string, got "${op.valueBaseUnits}"`);
    }
    const cap = op.chain.family === "evm" ? cfg.maxValueWei : cfg.maxAmountSats;
    const capName = op.chain.family === "evm" ? "maxValueWei" : "maxAmountSats";
    if (cap !== null && BigInt(op.valueBaseUnits) > BigInt(cap)) {
      throw new CodedError(
        "GATE_CAPPED",
        `${kind} of ${op.valueBaseUnits} base units exceeds the gate.${capName} cap of ${cap}`,
        `Lower the amount or raise gate.${capName} in $AGENT_WALLET_HOME/config.json`,
      );
    }
    if (cap !== null) capApplied = capName;
  }

  return {
    allowed: true,
    kind,
    chain: op.chain.name,
    mainnet: !op.chain.testnet,
    policy: { allowMainnet: cfg.allowMainnet, capApplied },
  };
}
