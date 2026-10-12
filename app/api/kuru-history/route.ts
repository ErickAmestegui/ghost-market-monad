import { NextRequest, NextResponse } from 'next/server';
import { parseInvestigationRange, readKuruRpc, safeInvestigationError } from '@/lib/monad/kuru-investigation';

export async function GET(request: NextRequest) {
  try {
    const range = parseInvestigationRange(request.nextUrl.searchParams.get('fromBlock'), request.nextUrl.searchParams.get('toBlock'));
    return NextResponse.json(await readKuruRpc({ range, rpcUrl: process.env.MONAD_RPC_URL }), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const code = safeInvestigationError(error);
    return NextResponse.json({ status: 'UNAVAILABLE', mode: 'HISTORICAL', provider: 'Monad JSON-RPC', requestId: crypto.randomUUID(), observedAt: new Date().toISOString(), error: code, warnings: [] }, { status: code === 'INVALID_RANGE' ? 400 : 503, headers: { 'cache-control': 'no-store' } });
  }
}
