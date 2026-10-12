import assert from 'node:assert/strict';
import test from 'node:test';
import {investigatePerpl,summarizeRiskWindow} from '../lib/monad/perpl-risk.ts';
import {parsePerplCandles,parsePerplFunding,readPerpl,type PerplResult} from '../lib/monad/perpl-intelligence.ts';

// SYNTHETIC_UNIT_FIXTURE: no generated fixture is imported into the application.
const to=1791831600000,from=to-720*3600000;
const m={id:10,name:'MON',unit:'MON',priceDecimals:6,sizeDecimals:0,collateral:'AUSD',collateralDecimals:6,exchange:'0x'+'a'.repeat(40),isOpen:true,fundingIntervalSeconds:2580};
const fixture=():PerplResult=>({status:'AVAILABLE',requestId:'SYNTHETIC_UNIT_FIXTURE',source:'UNIT_TEST_ONLY',observedAt:new Date(to).toISOString(),markets:[m],market:m,requestedWindow:{from,to,hours:720},traces:[],
 history:{block:1,timestamp:to,from,to,resolutionSeconds:3600,expectedBars:720,complete:true,excludedBars:0,observedVolumeCollateral:7200,candles:Array.from({length:720},(_,i)=>({timestamp:from+i*3600000,open:1,close:1,high:1,low:1,volume:10,trades:2}))},
 funding:Array.from({length:1000},(_,i)=>({block:i+1,timestamp:from+(i+1)*2580000,ratePercent:.001,rawRate:10})),
 ticker:{block:2000,timestamp:to,oracle:1,mark:1,last:1,bid:1,ask:1,dailyVolumeBase:100,dailyVolumeCollateral:100,openInterestBase:10000},
 book:{block:2000,timestamp:to,depthLimit:10,bids:[{price:1,size:10,orders:1},{price:.999,size:10,orders:1},{price:.998,size:80,orders:1}],asks:[{price:1.001,size:10,orders:1},{price:1.002,size:10,orders:1},{price:1.003,size:10,orders:1}]}});

test('Temporal windows use actual closed candles, comparable per-hour units and unannualized deviation',()=>{
 const data=fixture();const risk=investigatePerpl(data);
 assert.deepEqual(risk.windows.map(w=>w.candles),[24,168,720]);
 assert.ok(risk.windows.every(w=>w.volumePerHour===10&&w.hourlyVolatilityPercent===0&&w.coverage==='COMPLETE'));
 assert.deepEqual(risk.windows.map(w=>w.returnCount),[23,167,719]);
 assert.ok(risk.windows.every(w=>w.fundingCoverage==='OBSERVED_EVENTS'));
});
test('Unqueried windows and candle gaps never masquerade as complete comparisons or zero risk',()=>{
 const data=fixture();data.requestedWindow!.from=to-24*3600000;data.requestedWindow!.hours=24;data.history!.from=data.requestedWindow!.from;data.history!.candles=data.history!.candles.slice(-24);
 assert.equal(summarizeRiskWindow(data,168).coverage,'NOT_QUERIED');assert.equal(summarizeRiskWindow(data,168).meanFundingPercent,null);
 data.history!.candles.splice(10,1);const window=summarizeRiskWindow(data,24);assert.equal(window.coverage,'PARTIAL');assert.equal(window.volumePerHour,null);assert.equal(window.hourlyVolatilityPercent,null);assert.equal(window.returnCount,21);
});
test('Volatility review requires full coverage and enough adjacent observations',()=>{
 const data=fixture();data.history!.candles.forEach((c,i)=>{c.close=i%2?1.1:1;c.high=1.1;});
 assert.equal(investigatePerpl(data).findings.find(f=>f.code==='VOLATILITY')?.state,'REVIEW');
 const short=fixture();short.requestedWindow={from:to-6*3600000,to,hours:6};short.history!.from=short.requestedWindow.from;short.history!.candles=short.history!.candles.slice(-6);
 assert.equal(investigatePerpl(short).findings.find(f=>f.code==='VOLATILITY')?.state,'INSUFFICIENT');
});
test('Funding uses only returned in-period rates, including signed extremes and missing intervals',()=>{
 const data=fixture();data.funding![999].ratePercent=-.02;data.funding!.push({block:5000,timestamp:from-1,ratePercent:9,rawRate:90000});
 const finding=investigatePerpl(data).findings.find(f=>f.code==='FUNDING')!;assert.equal(finding.state,'REVIEW');assert.equal(finding.value,-.02);assert.deepEqual(finding.blocks,[1000]);
 data.funding=[];assert.equal(summarizeRiskWindow(data,24).meanFundingPercent,null);assert.equal(investigatePerpl(data).findings.find(f=>f.code==='FUNDING')?.state,'INSUFFICIENT');
 data.funding=undefined;assert.equal(summarizeRiskWindow(data,24).fundingCoverage,'UNAVAILABLE');
});
test('Depth and open-interest review retain snapshot scope and reject stale or misaligned ratios',()=>{
 const data=fixture();let risk=investigatePerpl(data);
 assert.equal(risk.findings.find(f=>f.code==='DEPTH_CONCENTRATION')?.value,80);
 assert.equal(risk.findings.find(f=>f.code==='OI_DEPTH')?.value,.3);
 assert.equal(risk.findings.find(f=>f.code==='OI_DEPTH')?.state,'REVIEW');
 assert.equal(risk.findings.find(f=>f.code==='OPEN_INTEREST')?.threshold,null);
 data.book!.timestamp=to-61000;assert.equal(investigatePerpl(data).findings.find(f=>f.code==='OI_DEPTH')?.value,null);
 data.book!.timestamp=to-121000;risk=investigatePerpl(data);assert.equal(risk.findings.find(f=>f.code==='SPREAD')?.state,'STALE');assert.equal(risk.findings.find(f=>f.code==='OI_DEPTH')?.state,'STALE');
});
test('Absent sides, zero OI and failed endpoints preserve unknowns without liquidation predictions',()=>{
 const data=fixture();data.book!.asks=[];data.ticker!.openInterestBase=0;let risk=investigatePerpl(data);
 assert.equal(risk.findings.find(f=>f.code==='SPREAD')?.state,'INSUFFICIENT');assert.equal(risk.findings.find(f=>f.code==='OI_DEPTH')?.value,null);
 data.history=undefined;data.book=undefined;risk=investigatePerpl(data);assert.equal(risk.findings.find(f=>f.code==='VOLATILITY')?.state,'UNAVAILABLE');assert.equal(risk.findings.find(f=>f.code==='SPREAD')?.state,'UNAVAILABLE');assert.equal(risk.findings.find(f=>f.code==='OPEN_INTEREST')?.value,0);
 assert.ok(risk.limitations.some(s=>s.includes('No wallet positions')));
});
test('Historical parsers accept bounded 30-day evidence and exclude the unfinished candle',()=>{
 const data=fixture();const rows=data.history!.candles.map(c=>({t:c.timestamp,o:1000000,c:1000000,h:1000000,l:1000000,v:'10000000',n:2}));
 rows.push({...rows[0],t:to});const parsed=parsePerplCandles({r:3600,at:{b:1,t:to},d:rows},m,from,to);assert.equal(parsed.candles.length,720);assert.equal(parsed.excludedBars,1);assert.equal(parsed.complete,true);
 const funding=parsePerplFunding({m:10,d:data.funding!.map(f=>({at:{b:f.block,t:f.timestamp},feb:f.block,rate:f.rawRate}))},m);assert.equal(funding.length,1000);
 assert.throws(()=>parsePerplCandles({r:3600,at:{b:1,t:to},d:[]},m,from-3600000,to),/CANDLE_RANGE/);
});
test('Funding requests over the documented interval cap fail independently without oversized API calls',async()=>{
 const urls:string[]=[];
 const result=await readPerpl({hours:720,now:to,fetcher:async(url)=>{urls.push(String(url));
 if(String(url).endsWith('/context'))return Response.json({chain:{chain_id:143},tokens:[{id:1,symbol:'AUSD',decimals:6}],instances:[{id:1,collateral_token_id:1,address:m.exchange}],markets:[{id:10,instance_id:1,name:'MON',size_units:'MON',funding_interval_sec:60,config:{price_decimals:6,size_decimals:0,is_open:true}}]});
 if(String(url).includes('/candles/'))return Response.json({r:3600,at:{b:1,t:to},d:[]});
 return new Response('',{status:503});}});
 assert.equal(urls.some(u=>u.includes('/funding/')),false);assert.equal(result.status,'PARTIAL');assert.equal(result.traces.find(t=>t.path.includes('/funding/'))?.error,'FUNDING_INTERVAL_LIMIT');assert.equal(result.risk?.findings.find(f=>f.code==='FUNDING')?.state,'UNAVAILABLE');
});
