import { NextRequest, NextResponse } from 'next/server';
import { readKuruRpc, parseInvestigationRange, safeInvestigationError } from '@/lib/monad/kuru-investigation';
import { readEnvioReplay } from '@/lib/monad/kuru-historical-replay';
import { compareProviderEvents } from '@/lib/monad/provider-agreement';
export async function GET(request: NextRequest) {
    const token = process.env.ENVIO_API_TOKEN?.trim(), requestId = crypto.randomUUID();
    if (!token)
        return NextResponse.json({ status: 'CONFIG_REQUIRED', error: 'ENVIO_TOKEN_REQUIRED', requestId }, { status: 503, headers: { 'cache-control': 'no-store' } });
    try {
        const q = request.nextUrl.searchParams, range = parseInvestigationRange(q.get('fromBlock'), q.get('toBlock'));
        const [rpc, envio] = await Promise.all([readKuruRpc({ range, rpcUrl: process.env.MONAD_RPC_URL, maxTrades: 5000 }), readEnvioReplay(range.firstBlock, range.lastBlock, token)]);
        return NextResponse.json({ status: 'COMPARED', requestId, observedAt: new Date().toISOString(), window: range, result: compareProviderEvents(rpc.trades!, envio.trades), providers: ['Monad JSON-RPC', 'Envio HyperSync'], limits: ['Agreement between two providers does not independently prove finality.'] }, { headers: { 'cache-control': 'no-store' } });
    }
    catch (error) {
        return NextResponse.json({ status: 'UNAVAILABLE', requestId, error: safeInvestigationError(error) }, { status: 503, headers: { 'cache-control': 'no-store' } });
    }
}
