# Ghost Market — Monad Edition

Ghost Market: Monad Edition adds two real, reproducible Monad intelligence surfaces to the established Ghost Market interface. **Monad Network Pulse** reads mainnet blocks through JSON-RPC. **Kuru Flow Forensics** decodes real `Trade` events from Kuru's official MON/USDC order book and turns executed market flow into inspectable, non-prescriptive evidence.

This repository is read-only market-intelligence software. It does not connect a wallet, sign or submit transactions, execute trades, predict prices, or give financial advice.

## What is real and what is derived

| Output | Classification | Meaning |
| --- | --- | --- |
| Network identity and chain ID | `LIVE` | Returned by `eth_chainId` and rejected unless it is Monad mainnet `143` |
| Latest block number, hash and time | `LIVE` or `STALE` | Returned by Monad JSON-RPC; `STALE` means the newest returned block is more than 60 seconds old |
| Transaction hashes and counts | `LIVE` or `STALE` | Read from actual sampled block payloads; linked to MonadVision |
| Trend and density | `DERIVED` | Deterministic analysis of the latest 12 blocks, never presented as direct chain metadata |
| Forecast, price, liquidity or trade quality | `NOT PROVIDED` | Transaction count cannot establish any of these properties |
| Kuru MON/USDC trades | `LIVE` or `STALE` | Decoded from the official market contract's emitted `Trade` events |
| VWAP, aggressor flow and review flags | `DERIVED` | Deterministic calculations over the disclosed block window and thresholds |

The trend compares the recent six blocks with the preceding six. `RISING` or `COOLING` requires both a change of at least two transactions per block and at least 25%; otherwise it is `STEADY`. Density bands are descriptive and fixed: low `<10`, moderate `10–49.99`, high `≥50` transactions per block. These thresholds are product heuristics, not Monad protocol claims.

## Vertical slice

- `GET /api/monad-pulse` performs two read-only RPC operations: chain/head discovery and one 12-block JSON-RPC batch.
- The route validates chain ID, parses block evidence, returns up to five real transaction hashes, and never substitutes cached or simulated evidence when RPC fails.
- `MonadNetworkPulse` is the initial screen and reuses the existing Ghost Market shell, navigation, responsive styles and companion artwork.
- Pure signal logic is isolated and covered by Node tests.
- `GET /api/kuru-flow` verifies Monad chain ID and deployed bytecode, scans the latest 720 blocks in RPC-safe 90-block windows, decodes up to 60 recent `Trade` events from the official Kuru MON/USDC market, and returns explorer-linked evidence.
- Kuru flags are deliberately narrow: sparse sample, ≥70% one-sided aggressor flow, ≥50% volume concentration in one print, or ≥200 bps executed price range. They do not claim identity, intent, manipulation, safety or future returns.

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

This phase intentionally contains no wallet flow, payment, trade execution, new smart contract, demo video or broad redesign. The inherited BNB modules and their documentation remain in the tree for provenance and are explicitly separate from the Monad market intelligence surfaces.

There is currently **no project-owned Monad contract address or transaction hash**. The integration proves live read access to Monad mainnet and real chain activity. If the hackathon requires a deployed contract or a transaction created by this project, that is a separate phase requiring explicit approval.

See [Monad Network Pulse architecture](docs/MONAD_NETWORK_PULSE.md), the inherited [architecture document](docs/ARCHITECTURE.md), and [license](LICENSE).
