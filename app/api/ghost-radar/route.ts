import { NextRequest, NextResponse } from 'next/server';
import { readKuruRpc, parseInvestigationRange, safeInvestigationError, type Investigation } from '@/lib/monad/kuru-investigation';
import { createRadarCases, validateRadarRules, type RadarRules } from '@/lib/monad/ghost-radar';
import { readEnvioReplay } from '@/lib/monad/kuru-historical-replay';
import { analyzeKuruFlow } from '@/lib/monad/kuru-flow';
import { createBoundedProviderCache } from '@/lib/monad/bounded-provider-cache';
const cachedRead = createBoundedProviderCache<Investigation>({ ttlMs: 15000, maxEntries: 4, maxConcurrent: 2 });
export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams, provider = q.get('provider') ?? 'rpc';
    try {
        if (!['rpc', 'envio'].includes(provider))
            throw new Error('INVALID_RANGE');
        const rules: Partial<RadarRules> = {};
        for (const key of ['minimumTrades', 'concentrationPercent', 'imbalancePercent', 'repeatedEvents', 'activityMultiple'] as const)
            if (q.has(key))
                rules[key] = Number(q.get(key));
        validateRadarRules(rules);
        const end = q.get('toBlock');
        if (end != null && !/^\d+$/.test(end))
            throw new Error('INVALID_RANGE');
        const span = provider === 'envio' ? 10000 : 720;
        const range = end == null ? undefined : parseInvestigationRange(String(Math.max(0, Number(end) - span + 1)), end, span);
        if (provider === 'envio' && !process.env.ENVIO_API_TOKEN?.trim())
            return NextResponse.json({ status: 'CONFIG_REQUIRED', error: 'ENVIO_TOKEN_REQUIRED', provider: 'Envio HyperSync', cases: [] }, { status: 503, headers: { 'cache-control': 'no-store' } });
        if (provider === 'envio' && !range)
            throw new Error('INVALID_RANGE');
        const key = `${provider}:${end ?? 'head'}`;
        const data = await cachedRead(key, async () => {
            let data: Investigation;
            if (provider === 'rpc')
                data = await readKuruRpc({ range, rpcUrl: process.env.MONAD_RPC_URL, maxTrades: 5000 });
            else {
                const result = await readEnvioReplay(range!.firstBlock, range!.lastBlock, process.env.ENVIO_API_TOKEN!.trim());
                data = { status: 'REPLAYED', mode: 'HISTORICAL', provider: 'Envio HyperSync', requestId: crypto.randomUUID(), observedAt: new Date().toISOString(), window: { ...range!, blockCount: range!.lastBlock - range!.firstBlock + 1, decodedTradeCount: result.trades.length, returnedTradeCount: result.trades.length, capped: false }, analysis: analyzeKuruFlow(result.trades), trades: result.trades, warnings: [] };
            }
            return data;
        });
        return NextResponse.json(createRadarCases(data, Math.min(provider === 'envio' ? 8 : 6, data.window!.blockCount), rules), { headers: { 'cache-control': 'no-store' } });
    }
    catch (error) {
        const code = error instanceof Error && /^(INVALID_RULES|PROVIDER_BUSY)$/.test(error.message) ? error.message : safeInvestigationError(error);
        return NextResponse.json({ status: 'UNAVAILABLE', provider: provider === 'envio' ? 'Envio HyperSync' : 'Monad JSON-RPC', error: code, cases: [] }, { status: /^INVALID/.test(code) ? 400 : 503, headers: { 'cache-control': 'no-store' } });
    }
}
