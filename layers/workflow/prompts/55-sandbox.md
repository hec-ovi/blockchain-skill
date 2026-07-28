# Sandbox: run it on a real EVM

    agent-wallet sandbox-run --plan ./plan.json

Save the full JSON envelope to `sandbox.json` in the WORK DIR.

This deploys your contract into an in-memory EVM and runs every step and invariant. Nothing is installed, nothing is spent, nothing reaches a network.

## Read the output properly

- **`pass`** is true only when every step matched its `expect` and `returns`, and every invariant held. Anything else is false.
- **`failures[]`** names each deviation in plain words. Read all of them, not the first.
- **`steps[].revert`** decodes the actual failure: a custom error with its arguments, a `require` string, or `Panic(0x11) arithmetic overflow or underflow` with the meaning spelled out. A `Panic` is almost always a real bug, not a test that needs adjusting.
- **`steps[].logs`** are decoded events. A state-changing step with no log is a missing event. Check the values, not just the names.
- **`steps[].gasUsed`** is the real number. Note anything surprising now; step 80 works from these.
- **`deployed[].runtimeSizeBytes`** and **`overSizeLimit`** against the {{CODE_SIZE_LIMIT}} byte ceiling.
- **`warnings[]`** is solc's own warning list for the whole source set. Triage every one here if you have not already.
- **`balances`** is the final native balance of each account (`@name`) and contract (`$name`). Check the money ended where the spec says it should.

## When something fails

Fix the contract, not the test. The strong pull at this moment is to relax an assertion until it goes green. Every time you are about to change `plan.json` instead of `contract.sol`, stop and write down which is actually wrong. Adjust the test only when the test encoded something the spec never claimed, and note that you did.

Re-run `sandbox-run` after each fix. It takes a second and there is no cost to running it twenty times.

## When it passes

A green run is evidence of the behavior you tested, and nothing more. It says the paths you thought of work. It does not say the contract is safe: that is what the audit gate in the next step is for, and the audit will ask what you did not think to test.

Before advancing, look once at what is missing. Which function has no step? Which error has never fired? Which actor from `spec.md` never appears as a `from`? Add those steps and run again. It is far cheaper here than after the audit.
