# agentio

contractVersion: 1.0.0

## Purpose

The single agent-facing surface: one CLI and one MCP server that expose every layer's verbs with identical inputs and the identical core envelope.

## Inputs

- CLI: `agent-wallet <verb> [flags]` (see `agent-wallet help`). Passphrase from `AGENT_WALLET_PASSPHRASE` or `--passphrase`.
- MCP: stdio JSON-RPC (`agent-wallet mcp`). Tools mirror the CLI verbs. Passphrase ONLY from `AGENT_WALLET_PASSPHRASE` (never a tool argument).

## Outputs

Every verb and tool returns the core envelope ([../core/schema/envelope.json](../core/schema/envelope.json)); the schema is owned by each underlying layer. MCP tool results wrap that envelope as a single text content block of pretty JSON.

## Events

None.

## Errors

`UNKNOWN_VERB`, `PASSPHRASE_MISSING`, `TOOL_ERROR` (a tool-layer guard so the transport never crashes), plus every underlying layer's errors passed through unchanged.

## Dependencies

Composition root: reads the published api of keys, chains, read, sign, gate, send, learn, contracts, swap, bridge. Uses `@modelcontextprotocol/sdk` (stdio transport) and zod for tool input schemas.

## Invariants

- CLI and MCP call the SAME layer functions; there is no second implementation of any operation. A verb's behavior is independent of how it was invoked.
- The passphrase never rides in an MCP tool argument (a model could echo it); it comes from the environment.
- Tool descriptions state when to use each tool and are non-overlapping (send vs swap vs bridge), so a model routes correctly.

## How to modify this blackbox safely

A new layer verb becomes one CLI entry and one `registerTool` call, both delegating to that layer's api. Keep the two lists in lockstep (the distribution test enforces it). Never put business logic here; this layer only adapts arguments and formats envelopes.
