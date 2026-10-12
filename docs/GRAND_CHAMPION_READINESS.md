# Ghost Market — Grand Champion final sprint

## Resultado / outcome

El producto conserva Radar, LIVE, replay, evidencia, A/B y Perpl Risk. Ahora permite **encontrar → explicar → verificar → comparar → exportar** un caso desde la portada, manteniendo los eventos Kuru originales y consultando contexto Perpl MON con tiempos y unidades separados. Es investigación de lectura, no ejecución de trading ni IA generativa.

Stable published baseline: `f647d0228aa50759675996dd8507b399c0b6026a`. Local branch: `codex/grand-champion-final`. No commit, push, Cloudflare deployment, transaction, wallet, video or application submission belongs to this sprint. The original BNB repository was not modified. The previous `.env.example` placeholder and internal `MONAD_RESEARCH_DELIVERY.md` remain preserved local changes, outside this sprint.

## Phases and before / after

| Phase | Before | Implemented result | Limit |
| --- | --- | --- | --- |
| 0 | Published independent Radar/Perpl workflows, 112 tests | New local branch from the stable SHA; baseline tests, exact Monad remote and preserved prior changes | Production remains the published baseline |
| 1 | Separate spot and perpetual screens | Original Kuru case plus independent current MON Perpl context and overlapping closed historical hourly candles/funding | No historical OI/book, price spread, correlation, causality or arbitrage calculation |
| 2 | Open Radar, manually select and inspect | Main one-click action scans latest real logs and selects the first active ranked case; explicit fresh historical query offered for empty windows | One contract, bounded scan; no exhaustive history or bundled fallback |
| 3 | Radar case JSON and replay link | `ghost-report/v1`, original discovery/rules in deep link, event inspection, JSON and print layout | Deep links requery; exports preserve the original Kuru snapshot but are not independent finality proof |
| 4 | Technical documents only | Small bilingual `/verify` route with reconstruction steps, sources, provenance, deterministic explanations and honest award matrix | Exact award rules absent from available documentation remain unconfirmed |
| 5 | Conditional Envio adapter | CONFIG_REQUIRED retained and tested; no authorized token present | No real authenticated HyperSync comparison or completed bounty claim |
| 6 | Existing 112 unit tests and browser regressions | Additional report/time-alignment tests, new real-query/browser suite, retained regression suites, local Worker checks | Local verification cannot certify a future Cloudflare production build |
| 7 | Generic separate metrics | Defensible integrated investigation with explicit limits and reproducible contributor evidence | Useful research is demonstrated; competition outcome is aspirational |

## Reconstruct and verify

- Open the product and choose **Investigate a Real Market Case / Investigar un caso real de mercado**. Overview performs no background market queries.
- Radar uses the existing default rules and six latest 720-block windows, preferring active cases to quiet coverage.
- A selected Radar case also opens the report through **Investigate MON Across Markets** without replacing its original logs.
- Known reconstruction: `/?view=investigation&market=kuru-mon-usdc&provider=rpc&fromBlock=112681380&toBlock=112682099`.
- Single-block proof: `/?view=historical&market=kuru-mon-usdc&provider=rpc&fromBlock=112682099&toBlock=112682099`.
- Select a contributing event, inspect maker/taker/txOrigin, raw data/topics, block/hash/log index, price USDC/MON and size MON. New report links use Monadscan transaction/block/address pages; original links remain intact.
- Keep the original as A and query B. A peer Radar window is reused when available. A single-window report leaves B pending until a new query; it does not compare a snapshot against itself as another period.
- Perpl Risk opens its existing 24h/7d/30d workflow; returning restores the original Kuru case. Context can be refreshed independently.
- Copy report link, export structured JSON or print. The link contains provider, selected window, entire original scan, partition count and rule parameters. It never contains a provider URL or credential. Reopening may return changed evidence, rank or no events.

Real current-sprint source observations (2026-10-12):

- `112681380–112682099`: **four** Kuru Trade events; sparse `n=4` below the default directional minimum of five. A repeated-address finding is based on four distinct logs, not a person identity.
- `112682099`: **two** Kuru events. Preserved block hash `0x74dd5a8617d6a11c35d2cdb292bc554d195546d1f2eae4219eb6b9259b78b3d2`.
- RPC boundary timestamps: **06:19:02–06:22:39 UTC** on 2026-10-12. Block metadata is queried independently of original logs.
- Perpl historical focus: **06:00–07:00 UTC**, one closed hourly candle, collateral volume in **AUSD**, and **zero returned funding records inside this short interval**. No record is not a zero funding rate.
- Perpl current MON market ID **10**, AUSD collateral, six price decimals, zero MON-size decimals, funding interval **2,580 seconds**. These values are supplied by the verified public context, not assumed for unknown markets.
- Standalone comparison reverified **24 / 168 / 720 closed candles**, with historical OI/depth intentionally unavailable.
- Both report reconstruction with Envio and existing provider comparison return **503 CONFIG_REQUIRED / ENVIO_TOKEN_REQUIRED**. No key was hunted, requested or bypassed.

## Units, time and interpretation

Kuru `priceUsd`, `notionalUsd`, `vwapUsd` are retained legacy JSON field names denoting **USDC**, not verified USD cash. Perpl mark/oracle are protocol USD-reference prices; book/OI sizes use MON, and candle volume uses the context's collateral decimals (**AUSD** for the tested MON market). No cash-equivalence normalization is performed.

The report keeps Kuru's original `observedAt`, request ID, rules, sample, provider, raw logs and ranges. RPC first/last block timestamps have their own capture time. Current Perpl ticker/book timestamps and source traces remain separate. Closed hourly candle buckets may contain activity outside the short Kuru interval. An unfinished hour is not queried as historical evidence; missing bars mark partial coverage. Funding returned before the exact case-time interval is excluded, including the API's prior-record fallback. Estimated funding times are disclosed.

Boundary hash or range disagreement with metadata suppresses historical alignment while keeping the original Kuru evidence. A hash match at boundary blocks does not independently prove every intermediate event's canonical membership or finality.

Radar priority points are review heuristics, not statistical confidence. Returned-event coverage and sample adequacy are separate. Empty intervals are not aggressor equilibrium, market safety or inactive network proof. Perpl review gates preserve the existing 0.01% absolute funding/interval, 2% hourly log-return deviation, 25 bps spread, 50% eligible-depth concentration and <1% smaller shown side/OI rules. Depth versus OI requires ≤60-second timestamp skew; freshness is checked at capture with the existing 120-second gate. These are observable review conditions, not loss probabilities or predictions. Positions, liquidations, P&L, leverage distribution, identity, profitable arbitrage and future returns are unknown.

## Endpoints and resource boundaries

New application endpoints:

- `GET /api/ghost-case`: reconstructs the original bounded scan and rules, then selects the matching partition. RPC ≤720 blocks, Envio ≤10,000; windows 1–8; exact partition membership, official market/provider and rule bounds required. Duplicate meaningful parameters are rejected. No arbitrary provider URL accepted.
- `GET /api/case-context?fromBlock=<n>&toBlock=<n>`: verifies chain 143 and at most two boundary blocks; independently reads public MON Perpl data. A different asset is refused rather than substituted.

Perpl uses the existing official public GET paths at `https://app.perpl.xyz/api`: `/v1/pub/context`, `/v1/market-data/{id}/ticker`, `/v1/market-data/{id}/book?levels=10`, `/v1/market-data/{id}/candles/3600/{from}-{to}`, `/v1/market-data/{id}/funding/{from}-{to}`. No authentication, signing or trading endpoints are added.

New reconstruction cache: 15-second TTL, four retained entries, two concurrent upstream reconstructions. Context cache: 20 seconds, four entries, two concurrent contexts. Perpl's existing public read cache is shared with context: five seconds, eight entries, two concurrent loads. Same-key pending requests coalesce; failed promises are not cached. Limits are **per Worker isolate**, not a global rate limiter. Sources can return PROVIDER_BUSY; the app must not promise unlimited concurrent usage.

RPC metadata has a 10-second deadline and 50 KB response limit. Current Perpl retains its 18-second deadline and 1 MB responses. Historical focus uses two concurrent GETs, a 12-second shared deadline, 1 MB responses, ≤720 closed hourly buckets and the 1,024 funding-interval cap. Existing Kuru event limits, eight ≤90-block log chunks, maximum 5,000 decoded events and per-case newest-60 display limit remain intact. Pattern/A-B results are withheld for capped case views. No recurring scan or background provider loop was introduced.

## Validation evidence

Unit/API/browser fixtures explicitly labeled synthetic are test-only. The application never imports them. Repeated layout tests use captured **real** provider responses; deep-link reconstruction also performs a new real historical RPC query. Test-only errors and slow responses are intercepted in the browser.

Validation completed: **127/127 unit tests**, **ESLint passed**, **TypeScript passed**. Browser suites: **23** baseline Monad checks, **17** Championship checks and **17** Grand Champion checks; **57 groups passed, zero browser runtime errors**. Desktop 1440, tablet 820 and mobile 390/320 pixels, English/Spanish, actual historical deep-link queries, JSON export, print visibility, different-window A/B, original-case return from Perpl, empty-scan fresh historical fallback, input errors, missing context and slow recovery are exercised. Final **npm run build passed**. The complete Grand Champion suite was repeated against `wrangler dev --local` on port 5180: **17/17 groups passed**, zero browser runtime errors, including English/Spanish, mobile/tablet/desktop, actual RPC/Perpl requests and compiled deep-link/export/print flows. A separate current-hour request correctly returned **PARTIAL / WAITING_FOR_CLOSED_HOUR / NO_CLOSED_BUCKET**, preserving current Perpl context while withholding unfinished history. The compiled `/docs/grand-champion` route returned HTTP 200. Monadscan transaction, block and maker-address links each returned HTTP 200. The temporary Worker was stopped after verification; development preview remains at http://127.0.0.1:5179. Cloudflare remote build/deploy configuration is unchanged; no production deployment was attempted. Captures and machine-readable results are ignored under `work/qa`, `work/championship`, `work/grand-champion`; dependencies, temporary files and caches remain ignored. Existing npm manifest/lockfile and Cloudflare configuration are unchanged; `npm ci --dry-run --ignore-scripts` succeeded. Actual fresh Windows installation was already validated on the unchanged baseline lockfile; this sprint avoids another reinstall. Linux execution is not inferred from Windows verification.

## Competitive assessment and award readiness

| Criterion | Demonstrable strength | Remaining gap |
| --- | --- | --- |
| Product Quality | One action discovers, explains and verifies a case; original investigation survives context/replay/export | Short historical windows require honest sparse/coarse data states; external provider latency persists |
| Technical Excellence | Strict decoders, bounded caches/input/response limits, independent errors, preserved evidence, testable time alignment | No durable index, global rate limiter or independent finality verification |
| Monad Integration | Official Kuru events and real MON Perpl data on chain 143; block/hash/explorer reconstruction | Read-only public-provider integration; no project contract or submitted transaction |
| Track Fit | Onchain finance research across spot/perpetual venues with explainable funding/volatility/depth | Analytics does not execute trades or manage positions |
| Originality and Impact | Reproducible investigation narrative connects contributors to source evidence across venues | No defensible causal/correlation signal or proven user adoption is claimed |

States describe implementation readiness, **not an official award or eligibility decision**. Exact requirements absent from local documentation remain unconfirmed.

| Objective | Status | Concrete evidence / missing requirement |
| --- | --- | --- |
| Public Kuru/Perpl read path | VERIFIED | Real event, context, candle, ticker, funding and book queries exercised; a technical fact, not a bounty |
| Grand Champion | PARTIAL | Integrated product and reproducibility demonstrable; exact requirements and judging outcome unconfirmed |
| Onchain Finance & Trading | PARTIAL | Spot/perpetual research and inspection; no execution; exact requirements unconfirmed |
| Perpl Best Use of API | PARTIAL | Five official public source paths, cross-market context, source/coverage traces; exact deliverables unconfirmed |
| Perpl Analytics / Risk | PARTIAL | Transparent funding/volatility/OI/depth review and verified temporal coverage; exact eligibility unconfirmed |
| Envio Best Use | BLOCKED | Conditional adapter exists; authorized token/authenticated evidence and actual agreement missing |
| Kuru Trading | NOT ELIGIBLE | Trading functionality is absent in this implementation; exact official rules unconfirmed |
| MetaMask Agent Wallet | NOT ELIGIBLE | No agent wallet, signatures or transaction implementation |
| Nansen | BLOCKED | No authorized runtime data integration/access configured; intentionally not pursued |

No award is asserted fulfilled or guaranteed. Publication and final submission materials require separate user actions/authorization. Recommend publishing only after the listed local checks pass and the user grants a new publication authorization; retain the stable published SHA as fallback.

## File manifest and provenance

New: `lib/monad/case-report.ts`, `cross-market-context.ts`, `perpl-service.ts`; `app/api/ghost-case/route.ts`, `app/api/case-context/route.ts`; `ui/ghost-case-report.tsx`; `app/verify/page.tsx`; `tests/case-report.test.ts`; `scripts/verify-grand-champion-ui.mjs`; this report.

Updated: `lib/monad/ghost-radar.ts` (discovery scope metadata), `app/api/perpl-intelligence/route.ts` (reuse bounded cache), `ui/ghost-radar.tsx` (cross-market case action), `ui/kuru-flow-intelligence.tsx` (orchestration and original-case return), `components/ghost-market.tsx` (report route/footer), `app/globals.css` (scoped responsive/print styles), README and documentation route/index.

The visual identity, mascot, base shell and inherited BNB modules originate from `ErickAmestegui/ghost-market`, source commit `3a1d9d80e4e077db08f2337738a5b14f4dbeab0e`, under the retained LICENSE. OpenAI Codex assisted implementation, tests and documentation. Runtime explanations are deterministic code; the assistant is not a market-data source, oracle, onchain agent or generative model integration.
