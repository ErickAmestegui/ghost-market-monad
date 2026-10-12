import {MONAD_PUBLIC_RPC_URL} from './network-pulse.ts';
import {rpcHexToSafeNumber} from './kuru-flow.ts';
import {PERPL_API,parsePerplCandles,parsePerplFunding,type PerplMarket,type PerplResult} from './perpl-intelligence.ts';
import {readCachedPerpl} from './perpl-service.ts';
import {parseInvestigationRange,safeInvestigationError} from './kuru-investigation.ts';

type BlockStamp={number:number;hash:string;timestamp:number};
export type BlockWindow={provider:string;chainId:143;observedAt:string;first:BlockStamp;last:BlockStamp};
export type HistoricalFocus={status:'AVAILABLE'|'PARTIAL'|'UNAVAILABLE'|'WAITING_FOR_CLOSED_HOUR';from:number;to:number;caseFrom:number;caseTo:number;candles?:ReturnType<typeof parsePerplCandles>;funding?:ReturnType<typeof parsePerplFunding>;traces:{path:string;status:string;error?:string}[];error?:string};
export type CrossMarketContext={status:'AVAILABLE'|'PARTIAL'|'UNAVAILABLE';requestId:string;observedAt:string;source:string;blockWindow?:BlockWindow;current?:PerplResult;historical?:HistoricalFocus;error?:string;issues:string[]};

async function boundedJson(response:Response,max:number) {
 if(!response.ok)throw new Error(`PROVIDER_HTTP_${response.status}`);
 const reader=response.body?.getReader();if(!reader)throw new Error('EMPTY_RESPONSE');
 const decoder=new TextDecoder();let bytes=0,text='';
 while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.length;if(bytes>max){await reader.cancel();throw new Error('RESPONSE_LIMIT');}text+=decoder.decode(p.value,{stream:true});}
 return JSON.parse(text+decoder.decode()) as unknown;
}
export async function readBlockWindow(first:number,last:number,options:{rpcUrl?:string;fetcher?:typeof fetch;now?:number}={}):Promise<BlockWindow> {
 parseInvestigationRange(String(first),String(last),10000);
 const url=options.rpcUrl?.trim()||MONAD_PUBLIC_RPC_URL;if(new URL(url).protocol!=='https:')throw new Error('INVALID_RPC_CONFIG');
 const fetcher=options.fetcher??fetch,deadline=AbortSignal.timeout(10000);
 const rpc=async(method:string,params:unknown[])=>{const p=await boundedJson(await fetcher(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:method,method,params}),signal:deadline,cache:'no-store'}),50000) as {result?:unknown;error?:unknown};if(p.error||p.result==null)throw new Error('RPC_ERROR');return p.result;};
 const chain=await rpc('eth_chainId',[]);if(typeof chain!=='string'||rpcHexToSafeNumber(chain,'chain')!==143)throw new Error('WRONG_CHAIN');
 const read=async(n:number)=>{const b=await rpc('eth_getBlockByNumber',['0x'+n.toString(16),false]) as {number:string;hash:string;timestamp:string};const number=rpcHexToSafeNumber(b.number,'block'),seconds=rpcHexToSafeNumber(b.timestamp,'time');if(number!==n||!/^0x[0-9a-f]{64}$/i.test(b.hash)||!Number.isSafeInteger(seconds*1000)||seconds*1000>(options.now??Date.now())+60000)throw new Error('INVALID_BLOCK_TIME');return {number,hash:b.hash.toLowerCase(),timestamp:seconds*1000};};
 const stamps=await Promise.all(first===last?[read(first)]:[read(first),read(last)]);const a=stamps[0],b=stamps[1]??a;if(a.timestamp>b.timestamp)throw new Error('INVALID_BLOCK_TIME');
 return {provider:'Monad RPC block metadata',chainId:143,observedAt:new Date(options.now??Date.now()).toISOString(),first:a,last:b};
}
export function focusBounds(w:BlockWindow,now:number) {
 const from=Math.floor(w.first.timestamp/3600000)*3600000,to=Math.min(Math.ceil((w.last.timestamp+1)/3600000)*3600000,Math.floor(now/3600000)*3600000);
 if(to-from>720*3600000)throw new Error('FOCUS_WINDOW_LIMIT');
 return {from,to,caseFrom:w.first.timestamp,caseTo:w.last.timestamp};
}
export async function readHistoricalFocus(m:PerplMarket,w:BlockWindow,options:{now?:number;fetcher?:typeof fetch}={}):Promise<HistoricalFocus> {
 if(m.unit!=='MON')throw new Error('WRONG_ASSET');const bounds=focusBounds(w,options.now??Date.now());
 if(bounds.to<=bounds.from)return {status:'WAITING_FOR_CLOSED_HOUR',...bounds,traces:[],error:'NO_CLOSED_BUCKET'};
 const fetcher=options.fetcher??fetch,signal=AbortSignal.timeout(12000),traces:HistoricalFocus['traces']=[];
 const paths=[`/v1/market-data/${m.id}/candles/3600/${bounds.from}-${bounds.to}`,`/v1/market-data/${m.id}/funding/${bounds.caseFrom}-${bounds.caseTo}`];
 const results=await Promise.allSettled(paths.map(async(path,i)=>{try{
 if(i===1&&(bounds.caseTo-bounds.caseFrom)/1000>m.fundingIntervalSeconds*1024)throw new Error('FUNDING_INTERVAL_LIMIT');
 const value=await boundedJson(await fetcher(PERPL_API+path,{signal,cache:'no-store'}),1000000);
 const parsed=i===0?parsePerplCandles(value,m,bounds.from,bounds.to):parsePerplFunding(value,m).filter(f=>f.timestamp>=bounds.caseFrom&&f.timestamp<=bounds.caseTo);
 traces.push({path,status:'VERIFIED'});return parsed;
 }catch(error){const code=error instanceof Error&&error.message==='FUNDING_INTERVAL_LIMIT'?error.message:safeInvestigationError(error);traces.push({path,status:'UNAVAILABLE',error:code});throw new Error(code);}}));
 return {status:results.every(r=>r.status==='fulfilled')&&(results[0].value as HistoricalFocus['candles'])?.complete?'AVAILABLE':results.some(r=>r.status==='fulfilled')?'PARTIAL':'UNAVAILABLE',...bounds,candles:results[0].status==='fulfilled'?results[0].value as HistoricalFocus['candles']:undefined,funding:results[1].status==='fulfilled'?results[1].value as HistoricalFocus['funding']:undefined,traces};
}
export async function readCrossMarketContext(first:number,last:number):Promise<CrossMarketContext> {
 const results=await Promise.allSettled([readBlockWindow(first,last,{rpcUrl:process.env.MONAD_RPC_URL}),readCachedPerpl(undefined,24)]);
 const issues:string[]=[];const blockWindow=results[0].status==='fulfilled'?results[0].value:undefined;
 if(!blockWindow)issues.push('BLOCK_METADATA_UNAVAILABLE');
 let current=results[1].status==='fulfilled'?results[1].value:undefined;if(current?.market?.unit!=='MON'){current=undefined;issues.push('MON_PERPL_CONTEXT_UNAVAILABLE');}
 let historical:HistoricalFocus|undefined;
 if(blockWindow&&current?.market){try{historical=await readHistoricalFocus(current.market,blockWindow);}catch(error){issues.push(safeInvestigationError(error));}}
 if(current?.status!=='AVAILABLE')issues.push('CURRENT_PERPL_PARTIAL_OR_UNAVAILABLE');
 if(historical&&historical.status!=='AVAILABLE')issues.push(historical.error??'HISTORICAL_FOCUS_PARTIAL');
 return {status:!blockWindow&&!current?'UNAVAILABLE':issues.length?'PARTIAL':'AVAILABLE',requestId:crypto.randomUUID(),observedAt:new Date().toISOString(),source:PERPL_API,blockWindow,current,historical,issues};
}
