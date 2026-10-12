import assert from 'node:assert/strict';
import test from 'node:test';
import { PERPL_API, parsePerplContext, parsePerplTicker, parsePerplBook, parsePerplCandles, parsePerplFunding, readPerpl, scalePerpl } from '../lib/monad/perpl-intelligence.ts';
import { createBoundedProviderCache } from '../lib/monad/bounded-provider-cache.ts';
// SYNTHETIC_UNIT_FIXTURE: protocol-shaped samples; never used by production loaders.
const context = { chain: { chain_id: 143 }, tokens: [{ id: 1, symbol: 'AUSD', decimals: 6 }], instances: [{ id: 1, collateral_token_id: 1, address: '0x' + 'a'.repeat(40) }], markets: [{ id: 10, instance_id: 1, name: 'MON', size_units: 'MON', funding_interval_sec: 2580, config: { price_decimals: 6, size_decimals: 0, is_open: true } }] };
const market = parsePerplContext(context)[0];
const to = 1791828000000, from = to - 3600000, at = { b: 112820691, t: to };
const ticker = { mt: 9, d: { '10': { at, orl: 24810, mrk: 24820, lst: 24800, dv: 150, dva: '12345678', oi: 290 } } };
const book = { mt: 15, at, bid: [{ p: 24800, s: 200, o: 2 }], ask: [{ p: 24830, s: 300, o: 1 }] };
const candles = { mt: 12, at, r: 3600, d: [{ t: from, o: 25000, c: 24800, h: 25100, l: 24700, v: '12345678', n: 3 }, { t: to, o: 24800, c: 24800, h: 24800, l: 24800, v: '0', n: 0 }] };
const funding = { m: 10, d: [{ at, feb: at.b, rate: -40 }, { at, feb: at.b, rate: -35 }] };
test('Perpl scales official integer units without silently accepting floats or unsafe values', () => {
    assert.equal(scalePerpl(24820, 6), .02482);
    assert.equal(scalePerpl('12345678', 6), 12.345678);
    for (const value of ['1e6', '-1', '1.2', 1.2, Infinity, Number.MAX_SAFE_INTEGER + 1])
        assert.throws(() => scalePerpl(value, 6));
    assert.throws(() => scalePerpl('9'.repeat(60), 0), /UNSAFE/);
});
test('Perpl context rejects wrong chain, unknown collateral, duplicate markets and invalid decimals', () => {
    assert.equal(market.collateral, 'AUSD');
    assert.equal(market.unit, 'MON');
    assert.throws(() => parsePerplContext({ ...context, chain: { chain_id: 1 } }), /WRONG_CHAIN/);
    assert.throws(() => parsePerplContext({ ...context, tokens: [] }), /MISSING_COLLATERAL/);
    assert.throws(() => parsePerplContext({ ...context, markets: [context.markets[0], context.markets[0]] }), /DUPLICATE/);
    assert.throws(() => parsePerplContext({ ...context, tokens: [{ ...context.tokens[0], decimals: 19 }] }));
});
test('Perpl ticker preserves nullable unavailable fields and actual position size', () => {
    const state = parsePerplTicker(ticker, market);
    assert.equal(state.mark, .02482);
    assert.equal(state.bid, null);
    assert.equal(state.openInterestBase, 290);
    assert.equal(state.dailyVolumeCollateral, 12.345678);
    assert.throws(() => parsePerplTicker({ ...ticker, d: { '1': ticker.d['10'] } }, market));
    assert.throws(() => parsePerplTicker({ mt: 9, d: { '10': { at } } }, market), /MISSING_PRICES/);
});
test('Perpl book validates side ordering, crossed prices, quantities and bounded depth', () => {
    const parsed = parsePerplBook(book, market);
    assert.equal(parsed.bids[0].size, 200);
    assert.equal(parsed.depthLimit, 10);
    assert.throws(() => parsePerplBook({ ...book, bid: [{ p: 24900, s: 1, o: 1 }] }, market), /CROSSED/);
    assert.throws(() => parsePerplBook({ ...book, bid: [book.bid[0], { p: 24810, s: 1, o: 1 }] }, market), /UNSORTED/);
    assert.throws(() => parsePerplBook({ ...book, ask: Array(11).fill(book.ask[0]) }, market), /INVALID_ARRAY/);
    assert.throws(() => parsePerplBook({ ...book, ask: [{ p: 24830, s: 0, o: 1 }] }, market), /INVALID_LEVEL/);
    assert.deepEqual(parsePerplBook({ ...book, bid: [], ask: [] }, market).bids, []);
});
test('Perpl history counts only closed candles and discloses incomplete volume coverage', () => {
    const history = parsePerplCandles(candles, market, from, to);
    assert.equal(history.candles.length, 1);
    assert.equal(history.excludedBars, 1);
    assert.equal(history.observedVolumeCollateral, 12.345678);
    assert.equal(history.complete, true);
    assert.equal(parsePerplCandles({ ...candles, d: [] }, market, from, to).complete, false);
    assert.throws(() => parsePerplCandles({ ...candles, d: [candles.d[0], candles.d[0]] }, market, from, to), /CANDLE_TIME/);
    assert.throws(() => parsePerplCandles({ ...candles, d: [{ ...candles.d[0], h: 1 }] }, market, from, to), /OHLC/);
});
test('Perpl funding is per configured interval, signed and deduplicated by application block', () => {
    const events = parsePerplFunding(funding, market);
    assert.equal(events.length, 1);
    assert.equal(events[0].ratePercent, -.0035);
    assert.throws(() => parsePerplFunding({ ...funding, m: 1 }, market), /WRONG_MARKET/);
    assert.throws(() => parsePerplFunding({ m: 10, d: [{ ...funding.d[0], feb: 2 }] }, market), /BLOCK/);
});
const fetcher = (failure?: string, invalid = false): typeof fetch => async (url, init) => {
    assert.ok(String(url).startsWith(PERPL_API + '/v1/'));
    assert.equal(init?.method, undefined);
    assert.equal(init?.headers, undefined);
    if (failure && String(url).includes(failure))
        return invalid ? Response.json({ broken: true }) : new Response('', { status: 429 });
    return Response.json(String(url).endsWith('/context') ? context : String(url).endsWith('/ticker') ? ticker : String(url).includes('/book') ? book : String(url).includes('/candles') ? candles : funding);
};
test('Perpl loader is independent public read-only evidence with partial endpoint recovery', async () => {
    const full = await readPerpl({ now: to, hours: 6, fetcher: fetcher() });
    assert.equal(full.status, 'AVAILABLE');
    assert.equal(full.traces.length, 5);
    const limited = await readPerpl({ now: to, fetcher: fetcher('/funding') });
    assert.equal(limited.status, 'PARTIAL');
    assert.ok(limited.book);
    assert.equal(limited.funding, undefined);
    assert.equal(limited.traces.find(t => t.path.includes('/funding'))?.error, 'HTTP_429');
    const invalid = await readPerpl({ now: to, fetcher: fetcher('/ticker', true) });
    assert.equal(invalid.status, 'PARTIAL');
    assert.equal(invalid.ticker, undefined);
    await assert.rejects(readPerpl({ fetcher: fetcher('/context') }), /HTTP_429/);
    await assert.rejects(readPerpl({ hours: 1, fetcher: fetcher() }), /INVALID_PERIOD/);
    await assert.rejects(readPerpl({ marketId: 2, fetcher: fetcher() }), /UNKNOWN_MARKET/);
});
test('Perpl loader rejects malformed and oversized responses and never reflects credential error text', async () => {
    await assert.rejects(readPerpl({ fetcher: async () => new Response('not json') }), /INVALID_OR_UNAVAILABLE/);
    await assert.rejects(readPerpl({ fetcher: async () => new Response('x'.repeat(1000001)) }), /INVALID_OR_UNAVAILABLE/);
    await assert.rejects(readPerpl({ fetcher: async () => { throw new Error('https://provider/?secret=hidden'); } }), /^Error: INVALID_OR_UNAVAILABLE$/);
});
test('Provider cache coalesces requests, bounds concurrency, evicts old entries and expires by TTL', async () => {
    let now = 0, calls = 0;
    const cached = createBoundedProviderCache<number>({ ttlMs: 10, maxEntries: 1, maxConcurrent: 1, clock: () => now });
    let release!: (v: number) => void;
    const loader = () => { calls++; return new Promise<number>(resolve => { release = resolve; }); };
    const first = cached('A', loader), same = cached('A', loader);
    await assert.rejects(cached('B', loader), /PROVIDER_BUSY/);
    release(1);
    assert.equal(await first, 1);
    assert.equal(await same, 1);
    assert.equal(calls, 1);
    assert.equal(await cached('A', async () => 99), 1);
    now = 11;
    assert.equal(await cached('A', async () => 2), 2);
    await cached('B', async () => 3);
    assert.equal(await cached('A', async () => 4), 4);
    await assert.rejects(cached('C', async () => { throw new Error('failed'); }));
    assert.equal(await cached('C', async () => 5), 5);
});
