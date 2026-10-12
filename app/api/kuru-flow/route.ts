import { NextResponse } from 'next/server';
import { readKuruRpc, safeInvestigationError } from '@/lib/monad/kuru-investigation';
import { KURU_MON_USDC_MARKET } from '@/lib/monad/kuru-flow';

export async function GET() {
  try {
    const result = await readKuruRpc({ rpcUrl: process.env.MONAD_RPC_URL });
    return NextResponse.json({ ...result, protocol: { name: 'Kuru', market: 'MON/USDC', marketAddress: KURU_MON_USDC_MARKET, contractCodeVerified: true } }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ status: 'UNAVAILABLE', mode: 'LIVE', provider: 'Monad JSON-RPC', requestId: crypto.randomUUID(), observedAt: new Date().toISOString(), error: safeInvestigationError(error), warnings: [] }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
