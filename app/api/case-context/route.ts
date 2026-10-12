import {NextRequest,NextResponse} from 'next/server';
import {parseInvestigationRange,safeInvestigationError} from '@/lib/monad/kuru-investigation';
import {readCrossMarketContext,type CrossMarketContext} from '@/lib/monad/cross-market-context';
import {createBoundedProviderCache} from '@/lib/monad/bounded-provider-cache';
const read=createBoundedProviderCache<CrossMarketContext>({ttlMs:20000,maxEntries:4,maxConcurrent:2});
export async function GET(request:NextRequest){try{const q=request.nextUrl.searchParams,r=parseInvestigationRange(q.get('fromBlock'),q.get('toBlock'),10000);const data=await read(`${r.firstBlock}:${r.lastBlock}`,()=>readCrossMarketContext(r.firstBlock,r.lastBlock));return NextResponse.json(data,{headers:{'cache-control':'no-store'}});}catch(error){const code=error instanceof Error&&error.message==='PROVIDER_BUSY'?error.message:safeInvestigationError(error);return NextResponse.json({status:'UNAVAILABLE',error:code,issues:[code],requestId:crypto.randomUUID(),observedAt:new Date().toISOString()},{status:code==='INVALID_RANGE'?400:503,headers:{'cache-control':'no-store'}});}}
