import assert from 'node:assert/strict';
import test from 'node:test';
import { readKuruRpc, parseInvestigationRange, safeInvestigationError, compareInvestigations } from '../lib/monad/kuru-investigation.ts';
import { readEnvioReplay, parseHyperSyncQuantity, decodeHyperSyncKuruPage } from '../lib/monad/kuru-historical-replay.ts';
import { KURU_MON_USDC_MARKET, KURU_TRADE_TOPIC, analyzeKuruFlow } from '../lib/monad/kuru-flow.ts';

// Synthetic ABI fixtures are used only by tests, never by production adapters.
const hash=(c:string)=>`0x${c.repeat(64)}`;
const word=(v:bigint)=>v.toString(16).padStart(64,'0');
const addr=(c:string)=>c.repeat(40).padStart(64,'0');
const event=(index=0,block=100)=>({address:KURU_MON_USDC_MARKET,topics:[KURU_TRADE_TOPIC],blockHash:hash('b'),blockNumber:`0x${block.toString(16)}`,logIndex:`0x${index.toString(16)}`,transactionHash:hash('a'),data:`0x${[word(1n),addr('1'),word(1n),word(25000000000000000n),word(0n),addr('2'),addr('3'),word(2000000000000n)].join('')}`});
const mockRpc=(options:{chain?:string;logs?:ReturnType<typeof event>[];http?:number;head?:number}={}) => {
 const methods:string[]=[];
 const fetcher:typeof fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body));methods.push(body.method);
 const results:Record<string,unknown>={eth_chainId:options.chain??'0x8f',eth_blockNumber:'0x3e8',eth_getCode:'0x1234',eth_getBlockByNumber:{number:body.params[0],timestamp:`0x${(options.head??1800000000).toString(16)}`},eth_getLogs:options.logs??[]};
 return new Response(JSON.stringify({result:results[body.method]}),{status:options.http??200});};
 return {fetcher,methods};
};
test('historical range validates bounds, missing fields and safe integer end',()=>{
 for(const [f,t] of [['','1'],['1',''],['-1','2'],['1.5','2'],['5','4'],['0','720'],['0',String(Number.MAX_SAFE_INTEGER)]]) assert.throws(()=>parseInvestigationRange(f,t));
 assert.deepEqual(parseInvestigationRange('100','100'),{firstBlock:100,lastBlock:100});
});
test('historical RPC preserves actual event evidence, hashes and raw ABI data',async()=>{
 const mock=mockRpc({logs:[event()]});const result=await readKuruRpc({range:{firstBlock:100,lastBlock:100},fetcher:mock.fetcher,now:1800000010000});
 assert.equal(result.status,'REPLAYED');assert.equal(result.provider,'Monad JSON-RPC');assert.equal(result.trades?.[0].blockHash,hash('b'));assert.equal(result.trades?.[0].rawData,event().data);assert.equal(result.analysis?.tradeCount,1);assert.equal(result.analysis?.classification,'INSUFFICIENT');assert.equal(result.trades?.[0].sizeMon,200);
});
test('empty historical window is a successful result with null VWAP',async()=>{
 const result=await readKuruRpc({range:{firstBlock:100,lastBlock:100},fetcher:mockRpc().fetcher});assert.equal(result.status,'REPLAYED');assert.equal(result.analysis?.tradeCount,0);assert.equal(result.analysis?.vwapUsd,null);
});
test('live scans eight bounded RPC chunks and distinguishes stale heads',async()=>{
 const mock=mockRpc();const result=await readKuruRpc({fetcher:mock.fetcher,now:1800000100000});assert.equal(result.status,'STALE');assert.equal(mock.methods.filter(m=>m==='eth_getLogs').length,8);assert.equal(result.window?.blockCount,720);
 const fresh=await readKuruRpc({fetcher:mockRpc().fetcher,now:1800000010000});assert.equal(fresh.status,'LIVE');
});
test('rejects wrong chain, future windows, HTTP failure and duplicate or off-range logs',async()=>{
 await assert.rejects(readKuruRpc({fetcher:mockRpc({chain:'0x38'}).fetcher}),/WRONG_CHAIN/);
 await assert.rejects(readKuruRpc({range:{firstBlock:1001,lastBlock:1001},fetcher:mockRpc().fetcher}),/FUTURE_RANGE/);
 await assert.rejects(readKuruRpc({fetcher:mockRpc({http:429}).fetcher}),/PROVIDER_HTTP_429/);
 for(const logs of [[event(),event()],[event(0,99)]]) await assert.rejects(readKuruRpc({range:{firstBlock:100,lastBlock:100},fetcher:mockRpc({logs}).fetcher}),/INVALID_EVIDENCE_WINDOW/);
});
test('caps sample and metrics together at 60, withholding comparison',async()=>{
 const result=await readKuruRpc({range:{firstBlock:100,lastBlock:100},fetcher:mockRpc({logs:Array.from({length:61},(_,i)=>event(i))}).fetcher});assert.equal(result.window?.decodedTradeCount,61);assert.equal(result.trades?.length,60);assert.equal(result.analysis?.tradeCount,60);assert.equal(result.window?.capped,true);assert.equal(compareInvestigations(result,result),null);
});
test('comparison normalizes unequal block ranges and preserves zero/null empty evidence',async()=>{
 const empty=await readKuruRpc({range:{firstBlock:100,lastBlock:100},fetcher:mockRpc().fetcher});
 const populated=await readKuruRpc({range:{firstBlock:100,lastBlock:101},fetcher:mockRpc({logs:[event()]}).fetcher});
 const comparison=compareInvestigations(empty,populated)!;assert.equal(comparison.leftVolumePerBlock,0);assert.equal(comparison.rightVolumePerBlock,100);assert.equal(comparison.vwapDeltaPercent,null);assert.equal(comparison.imbalanceDeltaPoints,null);
});
test('no provider error text or credential URL is reflected to clients',()=>{
 assert.equal(safeInvestigationError(new Error('PROVIDER_HTTP_secret-token')),'PROVIDER_OR_EVIDENCE_ERROR');
 assert.equal(safeInvestigationError(new Error('https://provider/?api-key=secret')),'PROVIDER_OR_EVIDENCE_ERROR');assert.equal(safeInvestigationError(new DOMException('timed out','TimeoutError')),'PROVIDER_TIMEOUT');
});
test('HyperSync rejects missing quantities and missing joined block hashes',()=>{
 for(const value of ['', ' ', '-1','1.2'])assert.throws(()=>parseHyperSyncQuantity(value,'number'));
 assert.throws(()=>decodeHyperSyncKuruPage({next_block:2,data:{blocks:[],logs:[{block_hash:hash('b'),block_number:1,log_index:0,transaction_hash:hash('a'),address:KURU_MON_USDC_MARKET,topic0:KURU_TRADE_TOPIC,data:event().data}]}}),/missing join/);
});
test('Envio paginates with explicit provider and rejects nonadvancing or overshooting pages',async()=>{
 const cursors:number[]=[];const fetcher:typeof fetch=async(url,init)=>{assert.equal(url,'https://monad.hypersync.xyz/query');assert.equal((init?.headers as Record<string,string>).authorization,'Bearer test-token');const q=JSON.parse(String(init?.body));cursors.push(q.from_block);return Response.json({next_block:Math.min(q.from_block+1,q.to_block),archive_height:1000,total_execution_time:1,data:{logs:[],blocks:[]}});};
 const result=await readEnvioReplay(100,101,'test-token',fetcher);assert.deepEqual(cursors,[100,101]);assert.equal(result.pages,2);
 for(const next of [100,103])await assert.rejects(readEnvioReplay(100,101,'test-token',async()=>Response.json({next_block:next,data:{logs:[],blocks:[]}})),/INVALID_PAGINATION/);
 await assert.rejects(readEnvioReplay(100,100,'test-token',async()=>new Response('',{status:401})),/PROVIDER_HTTP_401/);
});
test('direction and concentration thresholds refer to the observed sample',()=>{
 const a=analyzeKuruFlow([]);assert.equal(a.classification,'INSUFFICIENT');assert.equal(a.largestTradeSharePercent,null);
});
