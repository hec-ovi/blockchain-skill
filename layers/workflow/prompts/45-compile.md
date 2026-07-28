# Compile: zero errors, and every warning triaged

Compile with the toolkit's own compiler, solc {{SOLC_VERSION}}, in process. Nothing to install.

    agent-wallet contract-compile --source ./contract.sol --name <ContractName>

Save the full JSON envelope to `compile.json` in the WORK DIR.

## What has to be true

1. **`ok` is true.** On `COMPILE_FAILED` the `hint` carries solc's own message with the file and line. Fix the source and compile again. Do not work around a compiler error by deleting the code that failed.
2. **Every warning is triaged.** Warnings do not appear in `contract-compile` output, so run the source through the sandbox in step 55 and read its `warnings` array, which carries solc's warnings for the whole source set. If you want them now, run a smoke plan through `sandbox-run` with a deploy and no steps. Treat each warning as one of: a real bug you fix, or a deliberate choice you write a one-line reason for. Shadowed declarations, unreachable code, deprecated builtins, and unused returns are the ones that hide real defects.
3. **Runtime size fits.** The deployed code must stay under {{CODE_SIZE_LIMIT}} bytes and the creation code under {{INITCODE_SIZE_LIMIT}}. The sandbox reports the exact runtime size and flags `overSizeLimit`. A contract over the limit deploys fine on some chains and is rejected on mainnet rules, which is a very late surprise.
4. **The ABI matches the interface you designed.** Compare the `abi` in `compile.json` against the interface table in `design.md`, name by name. A function you meant to be `external` that came out `public`, or a mutability that came out wrong, changes who can call what.

## If more than one file

Point `--source` at the main file. The compiler resolves relative imports among the sources you give it. If you get `import not found`, the file is not in the set you passed; inline it or add it as another source in the sandbox plan, which accepts a full source list.

Record in `compile.json`, or in a short note beside it, the contract name you will use from here on. Every later step refers to it.
