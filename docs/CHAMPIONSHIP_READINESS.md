# Ghost Market: Championship readiness — 2026-10-12

Local sprint assessment. This document records implementation evidence and limitations; it does not certify sponsor eligibility or predict an award.

## Executive assessment / resumen ejecutivo

Ghost now helps users discover a bounded real investigation, reconstruct its event evidence, compare windows and share a reproducible case. Perpl adds a separate, real perpetual-market research workflow. The stable LIVE, Replay, Evidence Explorer and Network Pulse paths remain available. **Envio is CONFIG_REQUIRED, Nansen is blocked, and no Kuru trading or MetaMask Agent Wallet integration is claimed.**

El núcleo pasó de consultar manualmente un bloque a descubrir casos mediante reglas transparentes. Hay datos reales de Kuru y Perpl, con procedencia y límites visibles. No se presentan patrones como fraude, identidades personales ni predicciones de beneficios. Todos los cambios permanecen locales.

## Phase results and before/after

| Phase | Before | Result | Remaining limitation |
| --- | --- | --- | --- |
| 0 — stable base | main at `31de671a6714488e99691c49daa9fd82ce58f188`, 80 tests | Local `codex/championship-sprint`; previous `.env.example` and internal research report preserved; baseline tests/build and canonical npm dry-run passed | Fresh installation was verified in the preceding preparation session; this sprint rechecked lock consistency/dry-run, without reinstalling dependencies |
| 1 — Radar | User manually chose a block | Automatic latest-horizon discovery, six real windows, deterministic ranking, Ghost Cases, timeline, contributor links, Replay/A-B, JSON/share links | RPC covers only 720 blocks of one official market; no exhaustive scan or persistent index |
| 2 — Envio | Conditional historical adapter | Radar's 10,000-block Envio path; same-window RPC/Envio comparison; pagination, exact duplicate handling, contradictory evidence rejection, response/archive limits | No server token: authenticated retrieval and real provider agreement remain unverified |
| 3 — Perpl | No Perpl workflow | Public market context, ticker, closed OHLCV, volume, funding, top-10 book, open interest, selection/export; independent endpoint errors | Provider evidence, no positions/identity/liquidation engine; snapshot rather than streaming |
| 4 — Nansen | No authorized access | Access presence evaluated; no wrapper masquerading as integration | No authorized API key; no labels or enrichment |
| 5 — optional trading/plugins | Read-only research | Official Kuru ABI and MetaMask plugin architecture evaluated; diagnosis below | No orders, wallet, SDK/plugin installation, signatures or spend capability |
| 6 — UX | Four investigation views | Discover CTA and coherent Radar/Perpl navigation; responsive cases and charts; expandable sources; EN/ES | Mobile main navigation scrolls horizontally; BNB menu stays outside the scroll strip |
| 7 — QA/security | 80 unit tests | 112 unit tests plus real-provider and browser regressions; final checks below | Local Worker verification does not establish production deployment success |
| 8 — jury review | No explicit critical matrix | This document and honest sponsor readiness table | Mandatory submission materials/eligibility rules were not accessed or fulfilled by this sprint |

## Real technical evidence

Local capture on 2026-10-12, not bundled application data:

- Known Kuru block **112682099**: two executed Trade events; preserved block hash `0x74dd5a8617d6a11c35d2cdb292bc554d195546d1f2eae4219eb6b9259b78b3d2`.
- Radar horizon **112681380–112682099**: four events, six contiguous windows. The repeated maker/taker finding references four distinct emitted events, without identifying a person.
- Automatic Radar capture **112827005–112827724**: 30 decoded events from the current RPC head, six candidate windows. Earlier captures returned 1 and 13 events; this variation is actual market activity, not a fixed demo.
- Perpl context: chain **143**, eleven returned markets; default MON market **10**, BTC **1** independently tested. Official instance exchange `0x34b6552d57a35a1d042ccae1951bd1c370112a6f`, AUSD collateral with six decimals. MON price decimals six, size decimals zero, funding interval 2,580 seconds at capture. These values come from context, not hardcoded UI assumptions.
- Perpl MON ticker, book, candles and funding: each returned HTTP 200 and passed its independent parser. MON 24h returned **24 closed hourly candles** after excluding the current unfinished candle. BTC 6h also returned AVAILABLE. No key/authentication was sent.
- `/api/ghost-radar?provider=envio&toBlock=112682099` and `/api/kuru-provider-compare?fromBlock=112682099&toBlock=112682099`: **503 CONFIG_REQUIRED / ENVIO_TOKEN_REQUIRED**. This is a blocker, not a successful Envio result.

Explorer reachability: Perpl block/contract links on Monadscan returned HTTP 200. The inherited MonadVision transaction link returned HTTP 403 to an automated GET; its URL/hash were verified but that automated check did not prove the page usable. No login or bypass was attempted.

Test artifacts remain ignored under `work/championship/` and `work/qa/`. Unit fixtures are explicitly synthetic, separate from captured real data and never imported as production fallbacks.

## Radar methodology and reproducibility

[Core rules](../lib/monad/ghost-radar.ts), [API](../app/api/ghost-radar/route.ts), [UI](../ui/ghost-radar.tsx).

The default RPC scan requests a single bounded horizon of 720 blocks in eight ≤90-block log requests and validates chain 143, deployed market code, event ABI/topic/address, hashes, ranges and unique keys. Radar may retain up to 5,000 decoded events server-side; ordinary LIVE/Replay retains its existing display limit of 60. Full horizon counts must match before cases or quiet intervals are inferred. Cases display/analyze the newest 60 events per window; a capped case suppresses pattern claims and cannot support A/B comparison.

Default gates: direction requires ≥5 fills and |imbalance| ≥70%; concentration requires ≥3 fills and the largest fill ≥50% of observed MON volume; repetition requires a maker/taker address in ≥2 distinct events; activity requires sufficient sample and density ≥2× the nonzero mean density of other uncapped windows. Maker/taker roles within one event count once; txOrigin repetition is not an identity heuristic. Rules are configurable and bounded. An all-empty remainder does not produce an infinite activity ratio.

Interest weights: concentration 30, imbalance 25, repeat 20, activity 25, ordinary flow 10, plus up to 15 count points. Caps: sufficient sample 100, sparse 35, truncated 15. The former evidence score is removed. Returned coverage is FULL_RETURNED or CAPPED, with returned/decoded counts; sample status is EMPTY, SPARSE or RULE_MINIMUM_MET, with the actual count and configured minimum. These statuses are independent. No statistical confidence, cryptographic assurance or market certainty is computed. Interest points are prioritization heuristics; ties use sample count then newest end block. Quiet cases are a secondary collapsed category, with zero-height timeline bars. Exports use ghost-case/v2 and retain shareable block/provider parameters.

Each case keeps provider/request/capture time, exact blocks, observed events, derived volume, rule thresholds, contributors and unknowns. The timeline is linked to actual block intervals. JSON preserves the entire case and rules. A shared URL encodes the official market identifier, bounded range and fixed provider; opening it executes a new historical query. **It reproduces event scope, not the original immutable response, ranking or custom-rule interpretation**; use the exported JSON to retain the original interpretation. Link availability still depends on the chosen provider and credentials.

## Envio: actual conditional integration

[Adapter](../lib/monad/kuru-historical-replay.ts), [provider comparison](../app/api/kuru-provider-compare/route.ts), [field comparison](../lib/monad/provider-agreement.ts), [evaluation](ENVIO_EVALUATION.md).

The documented fixed Monad mainnet HyperSync URL is `https://monad.hypersync.xyz`. The server sends Bearer credentials only there and filters the official Kuru market and Trade topic. Exclusive end/cursor pagination, joined hashes, unique event keys, identical-repeat deduplication, conflicting duplicates, lagging archive rejection, ≤20 pages, ≤5,000 events, ≤8MB per response and 25s overall deadline are enforced. RPC never silently substitutes for Envio. Real larger-range pagination remains unverified without credentials.

The same-window comparison is distinct from A/B. It checks presence by transaction hash/log index and decoded block number/hash, price, size, aggressor side, emitted participant addresses, order ID remaining size and preserved raw ABI data. Raw comparison also catches differences smaller than normalized numeric precision. Agreement is not independent finality or authenticated chain-identity assurance. It is currently unavailable, rather than falsely green.

### Secure activation, not performed in this sprint

For local development, set `ENVIO_API_TOKEN` in the private environment of the process launching `npm run dev`; do not prefix it `NEXT_PUBLIC_`, pass it in a URL, paste it in chat or store it in a tracked file. For example, in a private PowerShell terminal:

```powershell
$envioCredential = Read-Host 'Envio server token' -AsSecureString
$env:ENVIO_API_TOKEN = [System.Net.NetworkCredential]::new('', $envioCredential).Password
try { npm run dev -- --port 5179 }
finally { Remove-Item Env:ENVIO_API_TOKEN; Remove-Variable envioCredential }
```

Stop the existing local server before starting this process. After configuration, select Envio and query block 112682099; use **Compare RPC ↔ Envio** for the same range; then test a real larger range and preserve exported evidence. Investigate any mismatch before sponsor claims. Production configuration must use the authorized server secret manager in a later approved publication step; no remote secret was set now. `.env*` and `.dev.vars*` are ignored except the empty `.env.example`.

## Perpl methodology and sources

[Official API documentation](https://github.com/PerplFoundation/api-docs), [parser/loader](../lib/monad/perpl-intelligence.ts), [API](../app/api/perpl-intelligence/route.ts), [UI](../ui/perpl-intelligence.tsx).

Fixed public base `https://app.perpl.xyz/api`, GET only:

- `/v1/pub/context`: network, markets, instance, collateral and decimals; verified context cached ≤10s.
- `/v1/market-data/{id}/ticker`: oracle/mark/last, reported daily base/collateral volume, base open interest, source block/time. Missing values stay null.
- `/v1/market-data/{id}/book?levels=10`: bounded, sorted price/size/order-count levels; duplicate/crossed/invalid levels rejected. Shown size/spread are derived; not total liquidity or executable slippage.
- `/v1/market-data/{id}/candles/3600/{from}-{to}`: 6/24/168/720 closed hours, validated OHLC/time/scales; unfinished/out-of-period bars excluded. Volume is the sum of returned closed candles in collateral units. Missing bars mean incomplete coverage, never a full-period total.
- `/v1/market-data/{id}/funding/{from}-{to}`: signed micros, percentage = raw rate ÷10,000, per context interval. Updates deduplicate by application block; latest timestamp may be estimated until that block. No APR/annualized return inferred.

Perpl mark/oracle are protocol USD-reference prices; AUSD collateral is not assumed to be dollar cash. Kuru price is USDC/MON. Spot/perpetual context only appears after a real LIVE capture and retains both windows/units. No mathematical dollar spread, identity, account positions, liquidation prediction or arbitrage profitability is claimed. Chart selection is a real hourly close with inspectable OHLC, count and collateral volume; chart animation does not invent trades.

Four market endpoints execute independently under one 18s deadline and ≤1MB response bound. One failure produces PARTIAL with valid sections preserved. Context or complete failure shows UNAVAILABLE. UI has a 23s request limit. Exports and expandable traces include paths, actual status, units and timestamps; cached context is disclosed.

## Cost and security bounds

[Bounded cache](../lib/monad/bounded-provider-cache.ts) coalesces identical in-flight requests and evicts cached values. Radar: 15s TTL, four entries, two simultaneous horizons per isolate. Perpl: 5s result TTL, eight entries, two simultaneous snapshots per isolate; four independent market reads plus context when needed. Endpoints use fixed upstream hosts; no caller URL/proxy is accepted. Errors do not reflect raw provider messages or credential-bearing URLs.

These limits are **per Worker isolate, not a global distributed rate limit or DDoS defense**. Public API usage should be monitored after approved publication; no remote quota/WAF policy was changed. RPC/Envio comparison has the existing bounded provider limits but no distributed abuse protection. Snapshots and heuristic scores are not a market execution service.

No added dependency, transaction/signature method, spend approval, wallet or secret in client code. Previous BNB modules/fixtures/reports remain inherited and separately labeled; the original BNB checkout/remote was untouched. Existing LICENSE and original attribution remain, with Codex-assisted implementation/testing disclosed in README. Runtime explanations use deterministic code, not a claimed generative AI integration.

## Optional integrations: technical diagnosis

**Nansen — BLOCKED:** no authorized key available. No HTTP enrichment, labels or provider wrapper were invented. A future authorized implementation needs supported endpoint/schema verification, quota controls, label provenance/time and explicit separation from emitted addresses; no human identity guarantee.

**Kuru trading — NOT ELIGIBLE in the current product:** the [pinned official orderbook ABI](https://github.com/Kuru-Labs/Kuru-contracts-dex-public/blob/2060bb2736080c175d80d568bfdb6226bb5abd04/contracts/interfaces/IOrderBook.sol) distinguishes executed Trade evidence from order placement. A genuine routing experience needs deployed-contract/precision validation, order-type semantics, balance/margin/allowance context, spend/slippage bounds, fee/deadline handling, transaction preparation and authorized execution verification. This sprint implements none of that and never signs or routes an order. A read-only investigation does not substantiate a trading bounty.

**MetaMask Agent Wallet — NOT ELIGIBLE:** the [official plugin guide](https://docs.metamask.io/agent-wallet/plugins/build-a-plugin/) specifies the package `mm` manifest, schemaVersion 1, command IDs matching `PluginCommand`, per-command capabilities/data access, and local CLI build/install verification. A possible future research command could avoid wallet capabilities and set `requiresAuth/requiresInit` false, but it must be packaged/tested with the real host. No SDK, plugin or CLI permission was installed in this sprint; ordinary MetaMask connection would not satisfy that integration.

## Final verification

- Unit tests: **112 passing**, baseline 80 retained, 32 new cases including the final scoped risk pass. Tests cover Radar gates/coverage/capping/density, share validation, provider agreement, Envio duplicates/archive/limits/429, Perpl schema/scales/OHLC/book/funding/independent errors and cache concurrency/TTL.
- TypeScript and ESLint: passed after the final implementation/correction pass.
- Build: passed with Vinext; deployment configuration and package/lockfile unchanged.
- Stable browser suite: real RPC preset (two events/hash), real LIVE/Pulse, empty history, range errors, selection/raw evidence/export/filter, LIVE/HISTORY and historical A/B, missing Envio, RPC failure and slow recovery. EN/ES at 1440, 390, 320; ES at 820.
- Sprint browser suite: real automatic and preset Radar, real Perpl MON/BTC, invalid API parameters, Envio config, timeline/cases, JSON/share and fresh shared-link query, provider verification blocker, keyboard candle selection, spot/perpetual units, mobile BNB menu, rate limit/slow recovery, independent PARTIAL/UNAVAILABLE. EN/ES desktop/mobile; ES tablet/320. No browser runtime errors.
- Worker production-equivalent local validation: both complete browser suites passed against the compiled Wrangler `--local` runtime on port 5180. API checks included real Kuru/Radar/Perpl and missing-token Envio. This does not verify a remote deployment.

Reproduction: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`; start local dev, set `GHOST_TEST_URL`, run `node scripts/verify-monad-ui.mjs` and `node scripts/verify-championship-ui.mjs` with an available Playwright package. For built Worker use `npm run start -- --port 5180` (local only) and repeat against that address.

## Strict jury assessment

Subjective engineering assessment on a 10-point scale; no numerical prediction of awards:

| Dimension | Assessment | Strength | Gap |
| --- | --- | --- | --- |
| Product Quality | 7.5/10 | Complete discover → inspect → compare → share workflow; bilingual/mobile | Latest narrow horizon can be quiet; cases are not durably indexed |
| Technical Excellence | 7/10 | Validated adapters, reproducible evidence, 112 tests and failure states | No authenticated Envio proof, distributed quotas or independent finality verification |
| Monad Integration | 7/10 | Real chain143 Kuru logs and separate official Perpl context/data | No project-owned contract or actual transaction; Envio/Nansen blocked |
| Track Fit | 7.5/10 | Onchain financial research, perpetual structure and verifiability | No trading/risk execution workflow or user adoption proof |
| Originality and Impact | 7/10 | Explainable candidate discovery with contributor evidence and reproducible cases | Rules are simple; no multi-market historical index or demonstrated sustained adoption |

Competitive as a focused research product, not yet justified as a championship winner. The strongest demonstrable moment is automatic discovery followed by a contributor's real transaction and a shareable case. A quiet live window must be shown honestly; the real historical preset is a reproducible alternative, not an artificial market.

| Opportunity | Integration status | Recommendation |
| --- | --- | --- |
| Onchain Finance & Trading / general | PARTIAL for overall submission readiness; Kuru/Perpl technical data paths VERIFIED | Main product positioning is defensible; satisfy required materials and actual rules separately |
| Envio | BLOCKED | Do not claim completed Best Use of Envio until authenticated evidence/pagination/agreement and required deliverables are verified |
| Perpl analytics/risk | VERIFIED public data integration; PARTIAL bounty readiness | Candidate only for the analytics scope supported by evidence; do not claim unspecified risk/position requirements or automatic eligibility |
| Nansen | BLOCKED | Do not select as a completed integration |
| Kuru trading | NOT ELIGIBLE | Do not select based on this read-only product |
| MetaMask Agent Wallet | NOT ELIGIBLE | No real tested plugin; do not select |

No portal, prize/form research, recording, pitch or submission was performed. The provided deadline is 2026-10-13 23:59 GMT-4. Reserve remaining time for human-authorized publication and mandatory materials; do not expand the optional integration scope now.

## Changed file inventory

- Product shell/styles: `components/ghost-market.tsx`, `app/globals.css`, `ui/kuru-flow-intelligence.tsx`.
- New views: `ui/ghost-radar.tsx`, `ui/perpl-intelligence.tsx`, `ui/provider-verification.tsx`.
- New APIs: `app/api/ghost-radar/route.ts`, `app/api/perpl-intelligence/route.ts`, `app/api/kuru-provider-compare/route.ts`.
- New core utilities: `lib/monad/ghost-radar.ts`, `perpl-intelligence.ts`, `provider-agreement.ts`, `bounded-provider-cache.ts` in the same directory.
- Existing readers: `lib/monad/kuru-investigation.ts`, `lib/monad/kuru-historical-replay.ts`.
- Validation: `tests/ghost-radar.test.ts`, `tests/perpl-intelligence.test.ts`, `tests/kuru-investigation.test.ts`, `scripts/verify-championship-ui.mjs`.
- Documentation: `README.md`, `docs/ENVIO_EVALUATION.md`, this report, `app/docs/page.tsx`, `app/docs/[document]/page.tsx`.
- Secret hygiene: `.gitignore`; existing empty `.env.example` Envio placeholder clarified. The previous untracked `docs/MONAD_RESEARCH_DELIVERY.md` was preserved, not rewritten by this sprint.

Final review found no credential values in changed candidates. A secret-pattern scan flagged the secure environment-assignment example above, which is executable setup syntax, not a credential. Twenty-one compiled client JS files contained no Envio/Nansen key identifiers or synthetic test token. No files are staged, no dependency/deployment configuration changed, and ignored captures/runtime files remain excluded. This is a bounded inspection, not a claim that the entire inherited repository underwent a security audit.

## Release recommendation

Publish the core Radar + Kuru + Perpl product **only after final QA passes and explicit user approval**; do not delay the core for blocked optional integrations. Do not publish sponsor eligibility claims for Envio/Nansen/trading/Agent Wallet. Publication must review the final diff and exclude ignored captures, caches, dependencies, credentials and the previously existing internal research report. This sprint performs no commit, push, deployment or remote-secret mutation. Inspect at `http://127.0.0.1:5179/`.

## Final scoped pass — Ghost Radar and Perpl Risk Investigator

Only Radar evidence presentation, Perpl risk research and their validation were extended. Existing uncommitted work remains preserved on codex/championship-sprint. No new sponsor, trade or wallet capability was added.

- Radar now separates returned coverage from sample strength, removes the former 100/100 evidence score, and groups empty intervals under secondary coverage evidence. Empty bars are exactly zero. Automatic discovery, selection, contributing events, exports, fresh-query share links and A/B are retained.
- New risk core: [perpl-risk.ts](../lib/monad/perpl-risk.ts), [risk UI](../ui/perpl-risk-investigator.tsx), [risk tests](../tests/perpl-risk.test.ts). Existing Perpl loader/API/UI, Radar core/UI/tests, regression script, styles and README were updated. No package/lockfile or deployment configuration changed.
- Official endpoints returned HTTP200 for MON 7d/30d: 168/720 closed hourly candles and 234/1001 funding events. The 30d response supplies nested 24h/7d/30d comparisons ending at the same closed hour; these are not independent chronological periods. The live capture ended at 2026-10-12 15:00 GMT-4. Captures are ignored under work/final-risk/.
- Volatility: sample standard deviation of adjacent hourly log returns, expressed as percent, without annualization. At least 12 adjacent returns and exact complete candle coverage are required. Missing hours are never bridged. Review gate: ≥2% per hour. Volume/hour is provided only with complete candle coverage.
- Funding: largest absolute returned in-period rate, review |rate| ≥0.01% per configured interval with ≥5 events. Mean funding is an unweighted mean of returned rates, not an account cost, time-weighted cost, APR or P&L. Missing intervals are explicitly allowed by the API and are never filled with zero; there is no complete-funding-coverage claim. A pre-period fallback event is excluded.
- Book: quoted spread gate ≥25bps; largest quoted-level share ≥50% on a side with ≥3 returned levels. Shown weak-side size / reported open interest is a review ratio with a <1% gate, not execution capacity or liquidation probability. Ticker/book timestamps must differ ≤60s. Snapshots older than 120s or >60s in the future withhold review classification.
- Open interest retains provider snapshot units and block/time. No historical OI/depth endpoint, positions, liquidation feeds, leverage distribution, wallets or P&L was invented.
- Funding requests above the documented 1024-interval cap are withheld independently as FUNDING_INTERVAL_LIMIT; no oversized request or untested pagination is improvised. Candles are bounded to 720 hours plus a possible unfinished endpoint bar, ≤1MB response, under the existing request deadline/cache/concurrency bounds.
- Actual MON 30d capture: hourly deviation approximately 1.25214%; funding extreme 0.004%/interval; a quoted-depth concentration approximately 76.9562% met the 50% review gate. These are observations at capture, not promises of current conditions or future prices.
- Verification: 112 unit tests, TypeScript and ESLint passed. The enhanced browser suite passed EN/ES desktop and 390px, ES tablet/320px, preserving share/export/A-B and exercising real 30d comparisons, partial providers, slow loading and errors. npm ci --dry-run --ignore-scripts passed with a new local cache and unchanged canonical lockfile. A fresh full reinstall was not repeated in this pass. Final build and local Worker checks are recorded in the delivery response.

The previous sponsor assessment remains conditional; this pass does not establish eligibility. Publication still requires explicit user authorization.
