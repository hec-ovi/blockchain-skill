# Solidity contract workflow: start here

You are writing or reviewing a smart contract. Once deployed, the code is public, immutable, and holds money that anyone on earth can try to take. There is no patch release. That is why this work is handed to you ONE step at a time.

Read the current step, do exactly what it says, save the artifact it names, then run the `NEXT` command it prints. Do not fetch steps ahead. Do not batch several steps into one action. Do not write Solidity until a step tells you to, and do not touch a real network until a step tells you to.

Mirror the walk in your own todo list: as each step arrives, add it as a task, keep exactly one in progress, and mark it done before fetching the next. A long contract job then keeps its place even when the conversation gets long.

The walk enforces itself. A step that names an ARTIFACT will not let you advance until that file exists in the WORK DIR. If you try to skip ahead you get `WALK_BLOCKED` naming the step you owe. If the same step is served {{MAX_VISITS}} times you get `WALK_LOOPING`: stop, and tell the human what keeps failing.

## What you have without installing anything

Every command below is the `agent-wallet` CLI, one process, JSON on stdout, then exit. Nothing else is needed: no Foundry, no Hardhat, no anvil, no node, no testnet funds.

- `contract-compile` compiles Solidity with solc {{SOLC_VERSION}} in process.
- `sandbox-run` runs your contract on a real EVM in memory. It deploys, sends transactions from named accounts, decodes events and revert reasons, measures gas, and checks invariants you declare. It costs nothing and touches no network, so this is where you prove behavior and where you prove exploits.
- `contract-learn` fetches source and ABI for an address already on chain.
- `contract-deploy`, `contract-call`, `contract-write` reach a real chain. Only the deploy step uses them.

## Which workflow are you running?

Pick one and say which you picked:

- **build**: a new contract from a requirement. Spec, threat model, design, implementation, sandbox proof, audit gate, gas pass, deployment. This is the default when someone asks for a contract.
- **review**: a contract that already exists, given as source or as an address on chain. Map it, audit it, and prove each real finding with a runnable exploit in the sandbox.
- **ship**: source that is already written and already reviewed, and only needs the deployment path with its pre-flight checks.

If the human asked for something small ("a counter", "a hello world"), still run **build**. The walk is short for a small contract because the steps are short, and the audit gate is exactly what catches the one line that would have lost their money.

Start the walk:

    agent-wallet contract-step --mode build
