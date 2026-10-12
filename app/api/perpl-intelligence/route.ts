import { NextRequest, NextResponse } from 'next/server';
import { readPerpl, type PerplResult } from '@/lib/monad/perpl-intelligence';
import { createBoundedProviderCache } from '@/lib/monad/bounded-provider-cache';
const cachedRead = createBoundedProviderCache<PerplResult>({ ttlMs: 5000, maxEntries: 8, maxConcurrent: 2 });
export async function GET(request: NextRequest) {
    try {
        const q = request.nextUrl.searchParams, raw = q.get('marketId'), hours = Number(q.get('hours') ?? 24);
        if (raw != null && !/^[1-9]\d{0,5}$/.test(raw))
            throw new Error('INVALID_MARKET');
        if (![6, 24, 168, 720].includes(hours))
            throw new Error('INVALID_PERIOD');
        const data = await cachedRead(`${raw ?? 'MON'}:${hours}`, () => readPerpl({ marketId: raw == null ? undefined : Number(raw), hours }));
        return NextResponse.json(data, { status: data.status === 'UNAVAILABLE' ? 503 : 200, headers: { 'cache-control': data.status === 'AVAILABLE' ? 'public, max-age=5' : 'no-store' } });
    }
    catch (error) {
        const code = error instanceof Error && /^(INVALID_PERIOD|INVALID_MARKET|UNKNOWN_MARKET|WRONG_CHAIN|PROVIDER_BUSY|HTTP_\d+)$/.test(error.message) ? error.message : 'PROVIDER_OR_SCHEMA_ERROR';
        return NextResponse.json({ status: 'UNAVAILABLE', requestId: crypto.randomUUID(), observedAt: new Date().toISOString(), error: code, markets: [], traces: [] }, { status: /INVALID|UNKNOWN/.test(code) ? 400 : 503, headers: { 'cache-control': 'no-store' } });
    }
}
