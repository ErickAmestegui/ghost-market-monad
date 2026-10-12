import {validateRadarRules,type GhostCase,type RadarRules} from './ghost-radar.ts';
import {parseInvestigationRange,tradeKey} from './kuru-investigation.ts';
import {KURU_MON_USDC_MARKET} from './kuru-flow.ts';
import type {CrossMarketContext} from './cross-market-context.ts';

export const KNOWN_CASE={firstBlock:112681380,lastBlock:112682099};
export function reportQuery(c:GhostCase) {
 const w=c.evidence.window!,scan=c.scan??{...w,windowCount:1};
 return new URLSearchParams({view:'investigation',market:'kuru-mon-usdc',fromBlock:String(w.firstBlock),toBlock:String(w.lastBlock),provider:c.evidence.provider==='Envio HyperSync'?'envio':'rpc',scanFrom:String(scan.firstBlock),scanTo:String(scan.lastBlock),windows:String(scan.windowCount),...Object.fromEntries(Object.entries(c.rules).map(([k,v])=>[k,String(v)]))}).toString();
}
export function parseReportQuery(q:URLSearchParams) {
 for(const key of ['market','provider','fromBlock','toBlock','scanFrom','scanTo','windows','minimumTrades','concentrationPercent','imbalancePercent','repeatedEvents','activityMultiple'])if(q.getAll(key).length>1)throw new Error('INVALID_CASE_QUERY');
 if(q.get('market')!=='kuru-mon-usdc')throw new Error('INVALID_CASE_QUERY');
 const provider=q.get('provider')??'rpc';if(!['rpc','envio'].includes(provider))throw new Error('INVALID_CASE_QUERY');
 const max=provider==='rpc'?720:10000,range=parseInvestigationRange(q.get('fromBlock'),q.get('toBlock'),max);
 const scan=parseInvestigationRange(q.get('scanFrom')??String(range.firstBlock),q.get('scanTo')??String(range.lastBlock),max);
 const raw=q.get('windows')??'1';if(!/^[1-8]$/.test(raw))throw new Error('INVALID_CASE_QUERY');const windows=Number(raw),count=scan.lastBlock-scan.firstBlock+1;
 if(windows>count||!Array.from({length:windows},(_,i)=>({first:scan.firstBlock+Math.floor(i*count/windows),last:scan.firstBlock+Math.floor((i+1)*count/windows)-1})).some(w=>w.first===range.firstBlock&&w.last===range.lastBlock))throw new Error('INVALID_CASE_QUERY');
 const input:Partial<RadarRules>={};for(const key of ['minimumTrades','concentrationPercent','imbalancePercent','repeatedEvents','activityMultiple'] as const)if(q.has(key))input[key]=Number(q.get(key));
 return {provider,range,scan,windows,rules:validateRadarRules(input)};
}
export function chooseInvestigation(cases:GhostCase[]) {return cases.find(c=>c.category==='ACTIVE')??cases[0]??null;}
export function assembleCaseReport(c:GhostCase,context:CrossMarketContext|null) {
 const times=context?.blockWindow;
 const rangeConflict=!!times&&(times.first.number!==c.evidence.window!.firstBlock||times.last.number!==c.evidence.window!.lastBlock);
 const hashConflict=!!times&&c.evidence.trades!.some(t=>(t.blockNumber===times.first.number&&t.blockHash&&t.blockHash!==times.first.hash)||(t.blockNumber===times.last.number&&t.blockHash&&t.blockHash!==times.last.hash));
 const conflict=rangeConflict||hashConflict;
 const historic=conflict?undefined:context?.historical;
 return {schema:'ghost-report/v1',id:c.id,network:{name:'Monad mainnet',chainId:143},market:{asset:'MON',kuruMarket:KURU_MON_USDC_MARKET,spotQuote:'USDC',perpetualQuote:'Protocol USD-reference price',perpetualCollateral:context?.current?.market?.collateral??null},
  reproduce:{query:reportQuery(c),meaning:'Requeries the original scope and rule parameters, not an immutable copy of prior provider responses.'},
  selection:{rank:c.rank,priorityPoints:c.interest,coverage:c.coverage,sample:c.sample,scan:c.scan,rules:c.rules,findings:c.findings},
  kuru:c.evidence,blockWindow:conflict?null:times??null,
  perpl:{status:context?.status??'NOT_QUERIED',observedAt:context?.observedAt??null,issues:context?.issues??[],currentContext:context?.current??null,historicalFocus:historic??null,error:context?.error??null,source:context?.source??null},
  alignment:{boundaryHashConflict:hashConflict,boundaryRangeConflict:rangeConflict,currentPerplIsHistoricalEvidence:false,historicalResolutionSeconds:3600,meaning:'Historical Perpl candles are coarser overlapping closed-hour buckets; current mark, oracle, OI and book are independently timed context, never synchronized historical state.'},
  evidence:c.evidence.trades!.map(t=>({key:tradeKey(t),transactionHash:t.transactionHash,block:t.blockNumber,blockHash:t.blockHash??null,logIndex:t.logIndex,transactionUrl:`https://monadscan.com/tx/${t.transactionHash}`,blockUrl:`https://monadscan.com/block/${t.blockNumber}`})),
  interpretation:{engine:'DETERMINISTIC_RULES',observedEvents:c.sample.count,unknowns:['Human identity and intent','Independent finality','Historical Perpl mark, oracle, open interest and depth','Liquidations, account positions and P&L','Causality, executable arbitrage and profitability'],limits:['One Kuru market and bounded scan only.','Sample minimum is a heuristic, not statistical confidence.','USDC, AUSD and protocol USD-reference prices are not normalized as dollar cash.','No price spread, correlation or causal inference is calculated.','Absence of emitted Trade events is not market balance or safety.','Export preserves the original Kuru snapshot; context has separate source and capture timestamps.','A closed hourly candle can include activity outside the Kuru block interval.']}};
}
