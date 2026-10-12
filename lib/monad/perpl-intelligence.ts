export const PERPL_API = 'https://app.perpl.xyz/api';
export const PERPL_DOCS = 'https://github.com/PerplFoundation/api-docs';
import { investigatePerpl, type PerplRisk } from './perpl-risk.ts';
type Obj = Record<string, unknown>;
export type PerplMarket = {
    id: number;
    name: string;
    unit: string;
    priceDecimals: number;
    sizeDecimals: number;
    collateral: string;
    collateralDecimals: number;
    exchange: string;
    isOpen: boolean;
    fundingIntervalSeconds: number;
};
export type PerplTrace = {
    path: string;
    status: 'VERIFIED' | 'UNAVAILABLE';
    http: number | null;
    error?: string;
    cached?: boolean;
    observedAt?: string;
};
export type PerplCandle = {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    trades: number;
};
export type PerplFunding = {
    block: number;
    timestamp: number;
    ratePercent: number;
    rawRate: number;
};
const obj = (v: unknown): Obj => { if (v == null || typeof v !== 'object' || Array.isArray(v))
    throw new Error('INVALID_SCHEMA'); return v as Obj; };
const array = (v: unknown, max = 1024): unknown[] => { if (!Array.isArray(v) || v.length > max)
    throw new Error('INVALID_ARRAY'); return v; };
const str = (v: unknown) => { if (typeof v !== 'string' || v.length > 100)
    throw new Error('INVALID_STRING'); return v; };
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max)
    throw new Error('INVALID_INTEGER'); return v; };
const decimals = (v: unknown) => integer(v, 0, 18);
export function scalePerpl(value: unknown, d: number) {
    decimals(d);
    let raw: bigint;
    if (typeof value === 'number') {
        integer(value);
        raw = BigInt(value);
    }
    else if (typeof value === 'string' && /^\d{1,60}$/.test(value))
        raw = BigInt(value);
    else
        throw new Error('INVALID_SCALED_INTEGER');
    const precision = 10n ** BigInt(d), whole = raw / precision;
    if (whole > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('UNSAFE_SCALE');
    return Number(whole) + Number(raw % precision) / Number(precision);
}
function at(v: unknown) { const p = obj(v); return { block: integer(p.b), timestamp: integer(p.t, 1) }; }
function optionalScale(v: unknown, d: number) { return v == null ? null : scalePerpl(v, d); }
export function parsePerplContext(v: unknown): PerplMarket[] {
    const c = obj(v);
    if (integer(obj(c.chain).chain_id) !== 143)
        throw new Error('WRONG_CHAIN');
    const tokens = array(c.tokens, 100).map(obj), instances = array(c.instances, 20).map(obj);
    const seen = new Set<number>();
    return array(c.markets, 100).map(raw => {
        const m = obj(raw), config = obj(m.config), id = integer(m.id, 1);
        if (seen.has(id))
            throw new Error('DUPLICATE_MARKET');
        seen.add(id);
        const instance = instances.find(i => i.id === m.instance_id);
        if (!instance)
            throw new Error('MISSING_INSTANCE');
        const token = tokens.find(t => t.id === instance.collateral_token_id);
        if (!token)
            throw new Error('MISSING_COLLATERAL');
        const exchange = str(instance.address);
        if (!/^0x[0-9a-f]{40}$/i.test(exchange))
            throw new Error('INVALID_EXCHANGE');
        if (typeof config.is_open !== 'boolean')
            throw new Error('INVALID_STATE');
        return { id, name: str(m.name), unit: str(m.size_units), priceDecimals: decimals(config.price_decimals), sizeDecimals: decimals(config.size_decimals), collateral: str(token.symbol), collateralDecimals: decimals(token.decimals), exchange, isOpen: config.is_open, fundingIntervalSeconds: integer(m.funding_interval_sec, 1, 86400) };
    });
}
export function parsePerplTicker(v: unknown, m: PerplMarket) {
    const p = obj(v);
    if (p.mt !== 9)
        throw new Error('INVALID_MESSAGE_TYPE');
    const state = obj(obj(p.d)[String(m.id)]), stamp = at(state.at);
    if (state.orl == null && state.mrk == null && state.lst == null)
        throw new Error('MISSING_PRICES');
    return { ...stamp, oracle: optionalScale(state.orl, m.priceDecimals), mark: optionalScale(state.mrk, m.priceDecimals), last: optionalScale(state.lst, m.priceDecimals), bid: optionalScale(state.bid, m.priceDecimals), ask: optionalScale(state.ask, m.priceDecimals), dailyVolumeBase: optionalScale(state.dv, m.sizeDecimals), dailyVolumeCollateral: optionalScale(state.dva, m.collateralDecimals), openInterestBase: optionalScale(state.oi, m.sizeDecimals) };
}
export function parsePerplBook(v: unknown, m: PerplMarket) {
    const p = obj(v);
    if (p.mt !== 15)
        throw new Error('INVALID_MESSAGE_TYPE');
    const stamp = at(p.at);
    const side = (v: unknown, bid: boolean) => { const seen = new Set<number>(); const levels = array(v, 10).map(raw => { const l = obj(raw), price = scalePerpl(l.p, m.priceDecimals), size = scalePerpl(l.s, m.sizeDecimals); if (price <= 0 || size <= 0 || seen.has(price))
        throw new Error('INVALID_LEVEL'); seen.add(price); return { price, size, orders: integer(l.o, 1) }; }); for (let i = 1; i < levels.length; i++)
        if (bid ? levels[i].price > levels[i - 1].price : levels[i].price < levels[i - 1].price)
            throw new Error('UNSORTED_BOOK'); return levels; };
    const bids = side(p.bid, true), asks = side(p.ask, false);
    if (bids[0] && asks[0] && bids[0].price > asks[0].price)
        throw new Error('CROSSED_BOOK');
    return { ...stamp, bids, asks, depthLimit: 10 };
}
export function parsePerplCandles(v: unknown, m: PerplMarket, from: number, to: number) {
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to <= from || from % 3600000 || to % 3600000 || (to-from)/3600000 > 720) throw new Error('INVALID_CANDLE_RANGE');
    const p = obj(v);
    if (p.r !== 3600)
        throw new Error('INVALID_RESOLUTION');
    const stamp = at(p.at), seen = new Set<number>();
    const all = array(p.d, 721).map(raw => {
        const c = obj(raw), timestamp = integer(c.t, 1);
        if (timestamp % 3600000 !== 0 || seen.has(timestamp))
            throw new Error('INVALID_CANDLE_TIME');
        seen.add(timestamp);
        const open = scalePerpl(c.o, m.priceDecimals), close = scalePerpl(c.c, m.priceDecimals), high = scalePerpl(c.h, m.priceDecimals), low = scalePerpl(c.l, m.priceDecimals);
        if (low <= 0 || low > Math.min(open, close) || high < Math.max(open, close) || high < low)
            throw new Error('INVALID_OHLC');
        return { timestamp, open, high, low, close, volume: scalePerpl(c.v, m.collateralDecimals), trades: integer(c.n) };
    }).sort((a, b) => a.timestamp - b.timestamp);
    const candles = all.filter(c => c.timestamp >= from && c.timestamp + 3600000 <= to);
    return { ...stamp, candles, from, to, resolutionSeconds: 3600, expectedBars: (to - from) / 3600000, complete: candles.length === (to - from) / 3600000, observedVolumeCollateral: candles.reduce((sum, c) => sum + c.volume, 0), excludedBars: all.length - candles.length };
}
export function parsePerplFunding(v: unknown, m: PerplMarket) {
    const p = obj(v);
    if (p.m !== m.id)
        throw new Error('WRONG_MARKET');
    const events = new Map<number, PerplFunding>();
    for (const raw of array(p.d, 1025)) {
        const f = obj(raw), stamp = at(f.at), block = integer(f.feb), rate = integer(f.rate, -1000000, 1000000);
        if (block !== stamp.block)
            throw new Error('INVALID_FUNDING_BLOCK');
        events.set(block, { ...stamp, ratePercent: rate / 10000, rawRate: rate });
    }
    return [...events.values()].sort((a, b) => a.block - b.block);
}
export type PerplResult = {
    status: 'AVAILABLE' | 'PARTIAL' | 'UNAVAILABLE';
    requestId: string;
    observedAt: string;
    source: string;
    markets: PerplMarket[];
    market?: PerplMarket;
    ticker?: ReturnType<typeof parsePerplTicker>;
    book?: ReturnType<typeof parsePerplBook>;
    history?: ReturnType<typeof parsePerplCandles>;
    funding?: PerplFunding[];
    traces: PerplTrace[];
    error?: string;
    requestedWindow?: {from:number;to:number;hours:number};
    risk?: PerplRisk;
};
const contextCache: {
    at: number;
    value: unknown;
} = { at: 0, value: null };
export async function readPerpl(options: {
    marketId?: number;
    hours?: number;
    fetcher?: typeof fetch;
    now?: number;
} = {}): Promise<PerplResult> {
    const now = options.now ?? Date.now(), hours = options.hours ?? 24;
    if (![6, 24, 168, 720].includes(hours))
        throw new Error('INVALID_PERIOD');
    const fetcher = options.fetcher ?? fetch, deadline = AbortSignal.timeout(18000), traces: PerplTrace[] = [];
    const get = async (path: string) => { let http: number | null = null; try {
        const response = await fetcher(PERPL_API + path, { cache: 'no-store', signal: deadline });
        http = response.status;
        if (!response.ok)
            throw new Error(`HTTP_${http}`);
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error('EMPTY_RESPONSE');
        let size = 0, text = '';
        const decoder = new TextDecoder();
        while (true) {
            const part = await reader.read();
            if (part.done)
                break;
            size += part.value.length;
            if (size > 1000000) {
                await reader.cancel();
                throw new Error('RESPONSE_LIMIT');
            }
            text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode();
        const payload: unknown = JSON.parse(text);
        traces.push({ path, status: 'VERIFIED', http });
        return payload;
    }
    catch (error) {
        const code = error instanceof Error && /^HTTP_\d+$/.test(error.message) ? error.message : 'INVALID_OR_UNAVAILABLE';
        traces.push({ path, status: 'UNAVAILABLE', http, error: code });
        throw new Error(code);
    } };
    let context: unknown;
    if (!options.fetcher && contextCache.value && now >= contextCache.at && now - contextCache.at < 10000) {
        context = contextCache.value;
        traces.push({ path: '/v1/pub/context', status: 'VERIFIED', http: 200, cached: true, observedAt: new Date(contextCache.at).toISOString() });
    }
    else {
        context = await get('/v1/pub/context');
        parsePerplContext(context);
        if (!options.fetcher) {
            contextCache.value = context;
            contextCache.at = now;
        }
    }
    const markets = parsePerplContext(context);
    const market = options.marketId == null ? markets.find(m => m.unit === 'MON') ?? markets[0] : markets.find(m => m.id === options.marketId);
    if (!market)
        throw new Error('UNKNOWN_MARKET');
    const to = Math.floor(now / 3600000) * 3600000, from = to - hours * 3600000;
    const paths = [`/v1/market-data/${market.id}/ticker`, `/v1/market-data/${market.id}/book?levels=10`, `/v1/market-data/${market.id}/candles/3600/${from}-${to}`, `/v1/market-data/${market.id}/funding/${from}-${to}`];
    const parsers = [(v: unknown) => parsePerplTicker(v, market), (v: unknown) => parsePerplBook(v, market), (v: unknown) => parsePerplCandles(v, market, from, to), (v: unknown) => parsePerplFunding(v, market)];
    const results = await Promise.allSettled(paths.map(async (path, i) => {
        if (i===3 && hours*3600 > market.fundingIntervalSeconds*1024) {traces.push({path,status:'UNAVAILABLE',http:null,error:'FUNDING_INTERVAL_LIMIT'});throw new Error('FUNDING_INTERVAL_LIMIT');}
        const p = await get(path); try {
        return parsers[i](p);
    }
    catch {
        const trace = traces.find(t => t.path === path)!;
        trace.status = 'UNAVAILABLE';
        trace.error = 'INVALID_SCHEMA';
        throw new Error('INVALID_SCHEMA');
    } }));
    const value = (i: number) => results[i].status === 'fulfilled' ? results[i].value : undefined;
    const result:PerplResult = { status: results.every(r => r.status === 'fulfilled') ? 'AVAILABLE' : results.some(r => r.status === 'fulfilled') ? 'PARTIAL' : 'UNAVAILABLE', requestId: crypto.randomUUID(), observedAt: new Date(options.now ?? Date.now()).toISOString(), source: PERPL_API, markets, market, ticker: value(0) as PerplResult['ticker'], book: value(1) as PerplResult['book'], history: value(2) as PerplResult['history'], funding: value(3) as PerplResult['funding'], traces, requestedWindow:{from,to,hours} };
    return {...result,risk:investigatePerpl(result)};
}
