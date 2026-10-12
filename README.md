# Ghost Market: Monad Edition

Investigate real Kuru MON/USDC fills on Monad mainnet (chain ID 143). **Ghost Radar** discovers reproducible investigations from a bounded real block scan. **Perpl Market Intelligence** independently exposes official perpetual market data. Overview, Live Investigation, Historical Replay and Evidence Explorer remain available in English and Spanish. Ghost's visual identity, companion and inherited modules are retained. BNB modules are accessible under **BNB legacy & more** and do not load their providers while a Monad view is active.

## Discover a Ghost Case

Choose **Find an Investigation** on the overview. Radar scans the latest 720 RPC blocks once, partitions them into six windows, and ranks cases by disclosed analytical rules and sample size. Inspect contributors, open a case in Replay, compare another window, copy a reproducible block-range link or export its evidence. Concentration, aggressor imbalance, repeated emitted addresses and relative activity are deterministic review prompts, not identity, manipulation or profit claims. Returned-event coverage is separate from sample size; meeting a heuristic minimum is not statistical confidence. Empty windows are retained in a collapsed secondary category and have zero-height bars; capped case views withhold pattern findings.

Perpl uses public GET endpoints at `https://app.perpl.xyz/api` after validating chain 143 and official per-market decimals. Inspect closed 1h candles over 6h/24h/7d/30d, mark/oracle/last, provider-reported volume/open interest, funding per configured interval, and top-10 book snapshots. MON spot/perpetual context retains different units and timestamps without an arbitrage calculation. Perpl Risk Investigator explains funding extremes, historical hourly volatility, quoted spread/depth concentration and snapshot open-interest context. Nested 24h/7d/30d comparisons require complete candles for volume/hour and volatility; funding averages describe only returned rates. Historical open interest, depth, liquidations, positions and P&L are not inferred. Endpoints fail independently; no wallet or API key is required. See [Championship readiness](docs/CHAMPIONSHIP_READINESS.md) for verified captures, scope and sponsor limitations.

## Investigate and reproduce

1. Open Historical Replay and choose **Investigate block 112682099** with Monad RPC.
2. Select either returned event. Inspect block/hash, log index, maker, taker, txOrigin, price, size, remaining order size and transaction explorer links.
3. Export the evidence JSON. RPC evidence includes the raw ABI data and event topic.
4. Keep this result as historical A, query another range and compare A/B; or capture a LIVE baseline for LIVE/HISTORICAL comparison.
5. Evidence Explorer filters the captured results by side, block, transaction hash or participant address. Filters do not change the metrics.

The preset is an on-demand historical query, not a simulation or bundled fixture. Two real Trade events were returned by the public RPC during local verification on 2026-10-12. This observation is not a promise of provider availability.

## Evidence and inference

| Output | Source and scope |
| --- | --- |
| Kuru events and participants | Official market `0x065C9d28E428A0db40191a54d33d5b7c71a9C394`, official non-indexed Trade ABI |
| LIVE | Latest 720 blocks, read through eight RPC windows of at most 90 blocks; STALE if head age exceeds 60 seconds at capture |
| Historical RPC | Inclusive caller-selected range of at most 720 blocks, independent of LIVE availability |
| Historical Envio | Explicit separate path of at most 10,000 blocks; requires server API token |
| Event sample | At most the newest 60 events; analysis uses the exact same returned sample. Decoded/returned counts and truncation are disclosed |
| Prices and notional | USDC per MON / USDC, not a verified USD valuation. Legacy JSON field names `priceUsd`, `notionalUsd`, `vwapUsd` are retained for compatibility and denote USDC in this market |
| Interpretation | Deterministic calculations and disclosed rules, not generative AI |
| Comparison | Counts, MON per block, VWAP change and imbalance percentage-point difference. Withheld for capped windows; absent VWAP remains null |
| Network Pulse | Read-only sample of 12 real Monad blocks, retained below Live Investigation |

Direction is withheld below five events. Descriptive direction bands use ±25% imbalance. Review flags require ≥70% absolute imbalance with ≥5 events, ≥50% single-event volume share with ≥3 events, or ≥200 bps price range with ≥5 events. UI references lead to contributing events. Addresses do not establish identity, beneficial ownership, intent, manipulation, safety or profitability.

Provider hashes are preserved; this app does not independently establish canonical membership or finality. LIVE is a captured request-time window, not an automatically updating stream. Empty windows are successful results. There is no synthetic production fallback.

## Providers and configuration

- `GET /api/kuru-flow`: live read-only Monad JSON-RPC.
- `GET /api/kuru-history?fromBlock=112682099&toBlock=112682099`: historical RPC.
- `GET /api/kuru-replay?fromBlock=<n>&toBlock=<n>`: Envio HyperSync, no RPC fallback.
- `GET /api/monad-pulse`: network context.
- `GET /api/ghost-radar?provider=rpc`: automatic discovery; optional `toBlock` and validated rule parameters. Envio requires a token and explicit end block.
- `GET /api/kuru-provider-compare?fromBlock=<n>&toBlock=<n>`: same-window RPC/Envio decoded-field agreement, at most 720 blocks; conditional on server token.
- `GET /api/perpl-intelligence?marketId=10&hours=24`: validated independent Perpl endpoints; optional market ID from official context and 6/24/168/720 closed hours.

`MONAD_RPC_URL` optionally overrides `https://rpc.monad.xyz`, server-side HTTPS only. `ENVIO_API_TOKEN` is server-only and is sent solely to the fixed `https://monad.hypersync.xyz/query` endpoint. Missing token returns CONFIG_REQUIRED; provider errors are sanitized and never reflect credential URLs. Requests have overall deadlines and bounded pagination/results.

Envio's official documentation lists chain ID 143 for HyperSync and HyperRPC. Local unauthenticated probes found `/height` available and `/chain_id` unauthorized (401). Authenticated historical queries have **not** been verified in this checkout. The adapter has pagination/hash-join/error tests, but no bounty eligibility or completed Envio delivery is claimed. RPC remains the proven default. See [Envio evaluation](docs/ENVIO_EVALUATION.md).

No runtime generative AI provider or authorized Nansen integration is configured; neither is claimed.

## Local verification

Requires Node ≥22.13.0 and npm 11.13.x (the package manager pin is `npm@11.13.0`). `package-lock.json` is the canonical lockfile; pnpm is not the supported installation path. Install from a clean checkout with:

```bash
npm run install:ci
npm test
npm run lint
npm run typecheck
npm run build
npm run dev
```

A clean `npm run install:ci` was verified with no existing `node_modules` and a new empty cache on Windows (Node 24.16.0, npm 11.13.0). The new lockfile pins registry tarballs and integrity hashes. Next’s required PostCSS 8.5.23 is available and remains unchanged. TypeScript-ESLint is pinned to the previously used 8.71.0 because an attempted 8.71.2 download returned HTTP 404 during verification. Do not bypass the lock with `npm install` in CI. Re-run `npm run install:ci` after intentional lockfile changes. Linux/Cloudflare execution has not been validated in this local Windows session.

Browser regression scripts: `scripts/verify-monad-ui.mjs` and `scripts/verify-championship-ui.mjs` (require Playwright; `PLAYWRIGHT_PACKAGE_PATH` can point to an installed package). Set `GHOST_TEST_URL` to the local server. Test-only failures/slow responses are intercepted within the test browser, never in application code. Captured real provider responses support repeated layout checks; shared case reproduction performs a new historical RPC query.

## Attribution and AI disclosure

Ghost's visual system, companion artwork, core shell and inherited BNB features originate from [ErickAmestegui/ghost-market](https://github.com/ErickAmestegui/ghost-market), source commit `3a1d9d80e4e077db08f2337738a5b14f4dbeab0e`, under the existing [LICENSE](LICENSE). Work in this session was exclusively in the separate local `ghost-market-monad` checkout. The original repository was not modified.

OpenAI Codex assisted with implementation, tests, UX and documentation. Runtime explanations are deterministic code; the assistant is not an oracle, evidence source, generative intelligence integration or onchain agent.

No wallets, signatures, swaps, contract deployment or trade execution were added. No recording, pitch or application submission is included. No project-owned Monad contract or project-submitted transaction is claimed. The repository's inherited reports, videos, screenshots and BNB documentation are prior artifacts, not proof of this Monad implementation or a new submission.
