# Envio evaluation — 2026-10-12

## Confirmed documentation

Official [supported networks](https://docs.envio.dev/docs/HyperSync/hypersync-supported-networks) lists Monad mainnet, chain ID **143**, at `https://monad.hypersync.xyz` and `https://monad.rpc.hypersync.xyz` (also numeric aliases). This is distinct from Monad testnet 10143.

[Query documentation](https://docs.envio.dev/docs/HyperSync/hypersync-query) supports contract/topic filters, selected log/block fields, an exclusive end block and `next_block` pagination. [HTTP examples](https://docs.envio.dev/docs/HyperSync/hypersync-curl-examples) document JSON POST `/query` and Bearer authentication. [Token documentation](https://docs.envio.dev/docs/HyperSync/api-tokens) requires an API token for HyperSync/HyperRPC.

## Local observations and blocking condition

- Public Monad RPC `eth_chainId`: `0x8f` (143).
- Monad RPC block 112682099: two Kuru Trade logs; block hash `0x74dd5a8617d6a11c35d2cdb292bc554d195546d1f2eae4219eb6b9259b78b3d2`.
- Envio `/height`: HTTP 200, height 112800516 at the time of the probe.
- Envio `/chain_id`: HTTP 401 without a token.
- No `ENVIO_API_TOKEN` is configured in this checkout. No authenticated historical query was executed successfully. A public height does not establish access to event queries.

## Implemented but conditional path

`/api/kuru-replay` calls only the fixed Monad HyperSync `/query` endpoint. It validates bounded ranges, required quantities, matching joined block hashes, event ABI/address/topic, page advancement, event containment and uniqueness, and response limits. Token values and provider error text are never returned to the browser. The network label comes from the documented fixed endpoint; runtime authenticated chain identity has not been established.

The Historical Replay provider picker exposes this path, including CONFIG_REQUIRED. **The feature depending on Envio is the separate historical event retrieval path and its pagination over up to 10,000 blocks.** RPC historical replay and Live Investigation remain independent and functional. Envio is not claimed as the source when RPC is selected.

## Remaining verification

Provide a server token through authorized configuration, run the block preset through Envio, compare actual event keys, prices, sizes and block hashes to RPC, then exercise pagination on a real larger range. Token-scoped service availability and partial/reorganization behavior require real provider verification. Tests currently use explicitly synthetic provider fixtures, not production fallback evidence.

No portal, prize research or submission was used. No bounty eligibility or completed deliverables are asserted. Nansen was not expanded: no concrete authorized integration was available, and it would displace the verified evidence workflow.
