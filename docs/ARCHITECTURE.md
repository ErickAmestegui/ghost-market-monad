# Ghost Market architecture

> **Monad Edition note:** the new, isolated Monad integration is documented in [MONAD_NETWORK_PULSE.md](MONAD_NETWORK_PULSE.md). The material below documents the inherited BNB Chain application and remains for attribution and provenance; it should not be read as a claim that those BNB features were migrated to Monad.

## Trust boundary

Ghost Market runs two deliberately separate paths.

1. **LIVE EVIDENCE** reads official xStocks metadata, BNB Smart Chain state and PancakeSwap V2 pools at request time. Binance Stocks Trading and Binance Web3 RWA data are requested only by server routes using separate production credentials.
   The independent Binance Wallet Skill adapter reads public Ondo metadata on BSC and normalizes token price by the provider multiplier without merging Ondo and xStocks identity or liquidity.
2. **DETERMINISTIC DEMO** runs versioned fixtures through pure consensus, confidence, scoring, replay and scenario functions. It is never promoted to `LIVE`.

```text
Browser
  ├─ /api/live-evidence
  │    ├─ xStocks public Assets API (official registry, market period, cached price)
  │    ├─ xStocks public Oracles API (feed provenance)
  │    ├─ BNB public JSON-RPC (contract bytecode, symbol, block)
  │    └─ PancakeSwap V2 factory/pair (pair discovery and reserves)
  ├─ /api/bnb-evidence
  │    └─ BNB public JSON-RPC (independent contract proof)
  ├─ /api/binance-integration
  │    └─ Binance Stocks Trading Market Data (server-only API key)
  ├─ /api/binance-web3-rwa
  │    └─ Binance Web3 RWA Data (server-only HMAC-signed API key + secret)
  └─ deterministic client engine
       ├─ consensus
       ├─ confidence
       ├─ Ghost Score
       └─ replay / scenarios / research
```

## Status semantics

- `LIVE`: read during the request from a verifiable source.
- `CACHED`: real provider data, but the provider does not prove request-time freshness.
- `REJECTED`: real observation that failed a quality threshold.
- `UNAVAILABLE`: source, market, credential or required value is absent.
- `SIMULATED`: versioned fixture used only by the deterministic demo.

## Weak-signal controls

A PancakeSwap V2 pool is accepted only when:

- the pair is returned by the verified factory;
- the pair contains the official xStock BSC address and BSC USDT;
- reserves are readable at an observed BSC block;
- estimated USD liquidity is at least $1,000; and
- estimated price impact for a $100 quote is no more than 2%.

Otherwise the observation is shown as `REJECTED` or `NO VERIFIED MARKET FOUND`. A rejected pool never feeds the LIVE AFTER-HOURS GAP.

The gap additionally requires a normalized traditional session of `CLOSED` or an actually active `AFTER-HOURS` session, a traditional quote with verifiable source freshness, and an accepted DEX block timestamp no older than five minutes. Binance Stocks transport can succeed while price freshness remains `CACHED` because its quote payload has no source timestamp; Ghost receipt time is never substituted for source time. During `OPEN`, the gap is deliberately paused. Generic provider strings such as `MARKET` are normalized before display.

## Binance failure isolation

`/api/binance-integration` reads `BINANCE_API_KEY` only on the server. It records a Ghost request ID, the status/latency of each successful upstream request and any provider request ID header returned. A Binance failure does not prevent xStocks, BNB RPC or deterministic-demo rendering.

`/api/binance-web3-rwa` reads `BINANCE_WEB3_API_KEY` and `BINANCE_WEB3_SECRET_KEY` only on the server. It signs the exact `/build/api/v1/...` wire path with HMAC-SHA256, searches the selected ticker, restricts candidates to BSC and the official `ondo`/`bstock` identifiers, then reads price, underlying profile and market state. Missing credentials return `UNAVAILABLE` without making an upstream request.

Safe states include `MISSING_CREDENTIALS`, `INVALID_CREDENTIALS`, `COMPLIANCE_RESTRICTED`, `RATE_LIMITED`, `TIMEOUT`, `ASSET_NOT_FOUND`, `EMPTY_RESPONSE`, `PROVIDER_BLOCKED` and `PROVIDER_ERROR`. The Stocks adapter retries Binance's documented alternate API hosts only when the provider edge returns a WAF-style block. A validated Stocks response is `CACHED`, not `LIVE`, until the provider exposes a verifiable quote source timestamp. Binance Web3 business code `40304` is retained in request evidence and classified as `COMPLIANCE_RESTRICTED`.

## Demo-module isolation

Ghost Pulse reads a record keyed by `AAPL`, `NVDA` and `TSLA`. The selected value is normalized with `Array.isArray` before filtering, and malformed entries are discarded. Missing data produces an explicit simulated-data empty state. The demo laboratory is also wrapped in a local React Error Boundary, so a failure in Pulse, Research, Council or another demo panel cannot replace the complete application with an error page.

## Security and privacy

- `BINANCE_API_KEY` is read only inside the server route.
- `BINANCE_WEB3_API_KEY` and `BINANCE_WEB3_SECRET_KEY` are read only inside the RWA server route; signatures and credentials are never returned or logged.
- No wallet connection, signature or transaction is requested.
- No API secret is serialized to the browser or committed to source.
- External values are rendered as data, never executed as instructions.
- Live BNB reads try three documented BNB Chain public RPC endpoints in order. Optional price/oracle metadata can degrade to `UNAVAILABLE` without erasing valid contract provenance.
