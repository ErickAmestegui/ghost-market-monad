import { NextRequest, NextResponse } from 'next/server';
import { readEnvioReplay, KURU_REPLAY_MAX_BLOCKS } from '@/lib/monad/kuru-historical-replay';
import { parseInvestigationRange, safeInvestigationError } from '@/lib/monad/kuru-investigation';
import { analyzeKuruFlow, KURU_MAX_TRADES } from '@/lib/monad/kuru-flow';

export async function GET(request: NextRequest) {
  const meta = { mode: 'HISTORICAL', provider: 'Envio HyperSync', requestId: crypto.randomUUID(), observedAt: new Date().toISOString() };
  const headers = { 'cache-control': 'no-store' };
  try {
    const range = parseInvestigationRange(request.nextUrl.searchParams.get('fromBlock'), request.nextUrl.searchParams.get('toBlock'), KURU_REPLAY_MAX_BLOCKS);
    const token = process.env.ENVIO_API_TOKEN?.trim();
    if (!token) return NextResponse.json({ ...meta, status: 'CONFIG_REQUIRED', error: 'ENVIO_TOKEN_REQUIRED', warnings: [] }, { status: 503, headers });
    const result = await readEnvioReplay(range.firstBlock, range.lastBlock, token);
    const trades = result.trades.slice(-KURU_MAX_TRADES);
    return NextResponse.json({ ...meta, status: 'REPLAYED', window: { ...range, blockCount: range.lastBlock - range.firstBlock + 1, decodedTradeCount: result.trades.length, returnedTradeCount: trades.length, capped: result.trades.length > trades.length }, analysis: analyzeKuruFlow(trades), trades: [...trades].reverse(), envio: { chainId: 143, chainIdentity: 'DOCUMENTED_FIXED_ENDPOINT', pages: result.pages, archiveHeight: result.archiveHeight, providerExecutionMs: result.providerExecutionMs }, warnings: ['Envio HyperSync only. Metrics use at most 60 returned trades. No RPC fallback.'] }, { headers });
  } catch (error) {
    const code = safeInvestigationError(error);
    return NextResponse.json({ ...meta, status: 'UNAVAILABLE', error: code, warnings: [] }, { status: code === 'INVALID_RANGE' ? 400 : 502, headers });
  }
}
