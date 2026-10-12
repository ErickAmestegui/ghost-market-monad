import {NextRequest,NextResponse} from 'next/server';
import {parseReportQuery} from '@/lib/monad/case-report';
import {createRadarCases,type GhostCase} from '@/lib/monad/ghost-radar';
import {readKuruRpc,safeInvestigationError,type Investigation} from '@/lib/monad/kuru-investigation';
import {readEnvioReplay} from '@/lib/monad/kuru-historical-replay';
import {analyzeKuruFlow} from '@/lib/monad/kuru-flow';
import {createBoundedProviderCache} from '@/lib/monad/bounded-provider-cache';
const read=createBoundedProviderCache<GhostCase[]>({ttlMs:15000,maxEntries:4,maxConcurrent:2});
export async function GET(request:NextRequest){try{
 const p=parseReportQuery(request.nextUrl.searchParams),token=process.env.ENVIO_API_TOKEN?.trim();
 if(p.provider==='envio'&&!token)return NextResponse.json({status:'CONFIG_REQUIRED',error:'ENVIO_TOKEN_REQUIRED'},{status:503,headers:{'cache-control':'no-store'}});
 const key=JSON.stringify(p);const cases=await read(key,async()=>{let data:Investigation;
 if(p.provider==='rpc')data=await readKuruRpc({range:p.scan,rpcUrl:process.env.MONAD_RPC_URL,maxTrades:5000});
 else{const result=await readEnvioReplay(p.scan.firstBlock,p.scan.lastBlock,token!);data={status:'REPLAYED',mode:'HISTORICAL',provider:'Envio HyperSync',requestId:crypto.randomUUID(),observedAt:new Date().toISOString(),window:{...p.scan,blockCount:p.scan.lastBlock-p.scan.firstBlock+1,decodedTradeCount:result.trades.length,returnedTradeCount:result.trades.length,capped:false},analysis:analyzeKuruFlow(result.trades),trades:result.trades,warnings:[]};}
 return createRadarCases(data,p.windows,p.rules).cases;});
 const selected=cases.find(c=>c.evidence.window!.firstBlock===p.range.firstBlock&&c.evidence.window!.lastBlock===p.range.lastBlock);if(!selected)throw new Error('INVALID_CASE_QUERY');
 return NextResponse.json({status:'READY',selected,cases},{headers:{'cache-control':'no-store'}});
 }catch(error){const message=error instanceof Error?error.message:'';const code=/^(INVALID_CASE_QUERY|INVALID_RULES|PROVIDER_BUSY)$/.test(message)?message:safeInvestigationError(error);return NextResponse.json({status:'UNAVAILABLE',error:code},{status:/^INVALID/.test(code)?400:503,headers:{'cache-control':'no-store'}});}}
