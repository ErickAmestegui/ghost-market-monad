# Monad Network Pulse architecture

## Purpose

Monad Network Pulse is a single read-only vertical slice for Ghost Market: real Monad identity, blocks and transaction evidence plus a bounded, explainable activity signal.

```text
Browser / MonadNetworkPulse
  └─ GET /api/monad-pulse
       ├─ eth_chainId + eth_blockNumber
       ├─ eth_getBlockByNumber × 12 (one JSON-RPC batch)
       └─ deterministic activity analysis
```

## Trust boundary

The API route accepts no user input and performs no write RPC method. It validates chain ID `143` before treating the response as Monad mainnet. A private RPC override stays server-side; its URL is never serialized to the browser. On any failure the endpoint returns `UNAVAILABLE` and does not use cached fixtures or simulated blocks.

## Evidence and derivation

Direct evidence:

- `eth_chainId` establishes the responding network identity;
- `eth_blockNumber` establishes the requested head;
- block number, hash, timestamp and transaction hashes come from `eth_getBlockByNumber`;
- explorer links allow independent inspection.

Derived analysis:

- sample size: latest 12 blocks;
- comparison: latest half versus earlier half;
- `RISING`: recent average is at least two tx/block higher and at least 25% higher;
- `COOLING`: recent average is at least two tx/block lower and at least 25% lower;
- `STEADY`: neither change gate is met;
- `QUIET`: the full sample contains no transactions;
- density: low `<10`, moderate `10–49.99`, high `≥50` average tx/block.

The analysis describes only this short block window. It does not identify transaction purpose or value and does not measure users, price, liquidity, risk, demand or trading quality.

## Status semantics

- `LIVE`: the latest returned block is no more than 60 seconds old when the server builds its response.
- `STALE`: valid real RPC evidence was returned, but its newest block is older than 60 seconds.
- `UNAVAILABLE`: the endpoint could not validate complete real evidence.
- `DERIVED`: interface label for deterministic calculations from the real block sample; never direct RPC metadata.

## Security and limitations

- No wallet, key, signature, transaction, approval, contract call or trading path exists in this feature.
- Public RPC endpoints can be rate-limited or unavailable.
- The 12-block sample is intentionally small and can change quickly.
- There is no project-owned Monad contract or project-generated Monad transaction hash in this phase.
- Monad network configuration was verified against official Monad documentation during implementation.

## Attribution

The interface and artwork were reused from the original [Ghost Market](https://github.com/ErickAmestegui/ghost-market) at commit `3a1d9d80e4e077db08f2337738a5b14f4dbeab0e`. OpenAI Codex assisted with this integration, tests and documentation. Runtime evidence is fetched from Monad JSON-RPC and the signal is deterministic; AI is not the data source.
