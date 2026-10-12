# Ghost Market — Monad Edition

Ghost Market: Monad Edition adds one narrow, real and reproducible Monad integration to the established Ghost Market interface. **Monad Network Pulse** reads Monad mainnet through JSON-RPC, shows verifiable blocks and transaction hashes, and derives a transparent short-window activity signal.

This repository is read-only market-intelligence software. It does not connect a wallet, sign or submit transactions, execute trades, predict prices, or give financial advice.

## What is real and what is derived

| Output | Classification | Meaning |
| --- | --- | --- |
| Network identity and chain ID | `LIVE` | Returned by `eth_chainId` and rejected unless it is Monad mainnet `143` |
| Latest block number, hash and time | `LIVE` or `STALE` | Returned by Monad JSON-RPC; `STALE` means the newest returned block is more than 60 seconds old |
| Transaction hashes and counts | `LIVE` or `STALE` | Read from actual sampled block payloads; linked to MonadVision |
| Trend and density | `DERIVED` | Deterministic analysis of the latest 12 blocks, never presented as direct chain metadata |
| Forecast, price, liquidity or trade quality | `NOT PROVIDED` | Transaction count cannot establish any of these properties |

The trend compares the recent six blocks with the preceding six. `RISING` or `COOLING` requires both a change of at least two transactions per block and at least 25%; otherwise it is `STEADY`. Density bands are descriptive and fixed: low `<10`, moderate `10–49.99`, high `≥50` transactions per block. These thresholds are product heuristics, not Monad protocol claims.

## Vertical slice

- `GET /api/monad-pulse` performs two read-only RPC operations: chain/head discovery and one 12-block JSON-RPC batch.
- The route validates chain ID, parses block evidence, returns up to five real transaction hashes, and never substitutes cached or simulated evidence when RPC fails.
- `MonadNetworkPulse` is the initial screen and reuses the existing Ghost Market shell, navigation, responsive styles and companion artwork.
- Pure signal logic is isolated and covered by Node tests.

## Run and verify

Requires Node.js `>=22.13.0`.

```bash
npm run install:ci
npm test
npm run lint
npm run build
npm run dev
```

Open `/api/monad-pulse` to inspect the evidence JSON. `MONAD_RPC_URL` is an optional server-only HTTPS override; when omitted, the route uses `https://rpc.monad.xyz`.

## Attribution and AI disclosure

The visual system, Ghost companion artwork, core application shell and pre-existing BNB Chain features were reused from [ErickAmestegui/ghost-market](https://github.com/ErickAmestegui/ghost-market), source commit `3a1d9d80e4e077db08f2337738a5b14f4dbeab0e`, under the repository's existing license. The original BNB repository was not modified; this is a separate working copy with its original remote removed.

OpenAI Codex was used to help implement Monad Network Pulse, its tests, interface integration and documentation. AI assistance is disclosed as development tooling, not as an on-chain agent, oracle, data source or verification authority. Runtime signals are produced by deterministic source code from RPC responses; no model generates live evidence.

## Scope and known gap

This phase intentionally contains no deployment, wallet flow, payment, trading integration, new smart contract, demo video or broad redesign. The inherited BNB modules and their documentation remain in the tree for provenance, but Monad Network Pulse is the only new hackathon integration in this edition.

There is currently **no project-owned Monad contract address or transaction hash**. The integration proves live read access to Monad mainnet and real chain activity. If the hackathon requires a deployed contract or a transaction created by this project, that is a separate phase requiring explicit approval.

See [Monad Network Pulse architecture](docs/MONAD_NETWORK_PULSE.md), the inherited [architecture document](docs/ARCHITECTURE.md), and [license](LICENSE).
