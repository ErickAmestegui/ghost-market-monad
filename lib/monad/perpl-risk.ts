import type { PerplCandle, PerplResult } from './perpl-intelligence.ts';

// Review gates, not probabilities of loss or price forecasts. No annualization.
export const PERPL_RISK_RULES = {
  fundingAbsPercent: 0.01, minimumFundingEvents: 5,
  hourlyVolatilityPercent: 2, minimumHourlyReturns: 12,
  spreadBps: 25, largestQuotedLevelPercent: 50,
  minimumDepthLevels: 3, weakSideToOiPercent: 1,
  maxSnapshotAgeSeconds: 120, maxSnapshotSkewSeconds: 60,
};
export type RiskWindow = {
  hours:number; from:number; to:number;
  coverage:'NOT_QUERIED'|'PARTIAL'|'COMPLETE'; candles:number; expectedCandles:number;
  volumePerHour:number|null; hourlyVolatilityPercent:number|null; returnCount:number;
  fundingCount:number; meanFundingPercent:number|null; fundingCoverage:'NOT_QUERIED'|'OBSERVED_EVENTS'|'UNAVAILABLE';
};
export type PerplFinding = {
  code:'FUNDING'|'VOLATILITY'|'SPREAD'|'DEPTH_CONCENTRATION'|'OI_DEPTH'|'OPEN_INTEREST';
  state:'REVIEW'|'DESCRIPTIVE'|'INSUFFICIENT'|'UNAVAILABLE'|'STALE';
  value:number|null; threshold:number|null; sample:number; blocks:number[]; candleTimes:number[];
};
export type PerplRisk = {
  rules:typeof PERPL_RISK_RULES; windows:RiskWindow[]; findings:PerplFinding[];
  requestedHours:number|null; bidSize:number|null; askSize:number|null;
  limitations:string[];
};

function volatility(candles:PerplCandle[]) {
  const returns:number[]=[];
  for(let i=1;i<candles.length;i++) {
    if(candles[i].timestamp-candles[i-1].timestamp===3600000)
      returns.push(Math.log(candles[i].close/candles[i-1].close));
  }
  const mean=returns.length?returns.reduce((s,v)=>s+v,0)/returns.length:0;
  const value=returns.length>=PERPL_RISK_RULES.minimumHourlyReturns?
    Math.sqrt(returns.reduce((s,v)=>s+(v-mean)**2,0)/(returns.length-1))*100:null;
  return {value,count:returns.length};
}

export function summarizeRiskWindow(data:PerplResult,hours:number):RiskWindow {
  const scope=data.requestedWindow??(data.history?{from:data.history.from,to:data.history.to,hours:data.history.expectedBars}:null);
  const to=scope?.to??0,from=to-hours*3600000;
  const queried=!!scope && scope.from<=from && scope.to>=to;
  const candles=queried?data.history?.candles.filter(c=>c.timestamp>=from&&c.timestamp+3600000<=to)??[]:[];
  const full=queried&&!!data.history&&candles.length===hours;
  const v=volatility(candles);
  // Missing funding intervals are allowed by the API. Never substitute zero or claim full funding coverage.
  const funding=queried?data.funding?.filter(f=>f.timestamp>=from&&f.timestamp<to):undefined;
  return {hours,from,to,coverage:!queried?'NOT_QUERIED':full?'COMPLETE':'PARTIAL',candles:candles.length,expectedCandles:hours,
    volumePerHour:full?candles.reduce((s,c)=>s+c.volume,0)/hours:null,
    hourlyVolatilityPercent:full?v.value:null,returnCount:v.count,
    fundingCount:funding?.length??0,meanFundingPercent:funding&&funding.length>=PERPL_RISK_RULES.minimumFundingEvents?funding.reduce((s,f)=>s+f.ratePercent,0)/funding.length:null,
    fundingCoverage:!queried?'NOT_QUERIED':funding?'OBSERVED_EVENTS':'UNAVAILABLE'};
}

export function investigatePerpl(data:PerplResult):PerplRisk {
  const r=PERPL_RISK_RULES;
  const scope=data.requestedWindow??(data.history?{from:data.history.from,to:data.history.to,hours:data.history.expectedBars}:null);
  const current=scope?summarizeRiskWindow(data,scope.hours):null;
  const findings:PerplFinding[]=[];
  const fresh=(timestamp:number)=>Date.parse(data.observedAt)-timestamp>=-60000&&Date.parse(data.observedAt)-timestamp<=r.maxSnapshotAgeSeconds*1000;
  const funding=scope?data.funding?.filter(f=>f.timestamp>=scope.from&&f.timestamp<scope.to):undefined;
  const extreme=funding?.reduce<typeof funding[number]|undefined>((a,b)=>!a||Math.abs(b.ratePercent)>Math.abs(a.ratePercent)?b:a,undefined);
  findings.push({code:'FUNDING',state:!funding?'UNAVAILABLE':funding.length<r.minimumFundingEvents?'INSUFFICIENT':extreme&&Math.abs(extreme.ratePercent)>=r.fundingAbsPercent?'REVIEW':'DESCRIPTIVE',value:extreme?.ratePercent??null,threshold:r.fundingAbsPercent,sample:funding?.length??0,blocks:extreme?[extreme.block]:[],candleTimes:[]});
  const vol=current?.hourlyVolatilityPercent??null;
  findings.push({code:'VOLATILITY',state:!data.history?'UNAVAILABLE':vol==null?'INSUFFICIENT':vol>=r.hourlyVolatilityPercent?'REVIEW':'DESCRIPTIVE',value:vol,threshold:r.hourlyVolatilityPercent,sample:current?.returnCount??0,blocks:data.history?[data.history.block]:[],candleTimes:data.history?.candles.length?[data.history.candles[0].timestamp,data.history.candles.at(-1)!.timestamp]:[]});
  const book=data.book,ticker=data.ticker;
  const bidSize=book?book.bids.reduce((s,l)=>s+l.size,0):null,askSize=book?book.asks.reduce((s,l)=>s+l.size,0):null;
  const spread=book?.bids[0]&&book.asks[0]?(book.asks[0].price-book.bids[0].price)/((book.asks[0].price+book.bids[0].price)/2)*10000:null;
  findings.push({code:'SPREAD',state:!book?'UNAVAILABLE':!fresh(book.timestamp)?'STALE':spread==null?'INSUFFICIENT':spread>=r.spreadBps?'REVIEW':'DESCRIPTIVE',value:spread,threshold:r.spreadBps,sample:book?book.bids.length+book.asks.length:0,blocks:book?[book.block]:[],candleTimes:[]});
  const sides=book?[book.bids,book.asks].filter(side=>side.length>=r.minimumDepthLevels):[];
  const shares=sides.map(side=>Math.max(...side.map(l=>l.size))/side.reduce((s,l)=>s+l.size,0)*100);
  const share=shares.length?Math.max(...shares):null;
  findings.push({code:'DEPTH_CONCENTRATION',state:!book?'UNAVAILABLE':!fresh(book.timestamp)?'STALE':share==null?'INSUFFICIENT':share>=r.largestQuotedLevelPercent?'REVIEW':'DESCRIPTIVE',value:share,threshold:r.largestQuotedLevelPercent,sample:book?book.bids.length+book.asks.length:0,blocks:book?[book.block]:[],candleTimes:[]});
  const oi=ticker?.openInterestBase??null;
  const aligned=!!book&&!!ticker&&Math.abs(book.timestamp-ticker.timestamp)<=r.maxSnapshotSkewSeconds*1000;
  const ratio=aligned&&oi!=null&&oi>0&&bidSize!=null&&askSize!=null&&book!.bids.length>0&&book!.asks.length>0?Math.min(bidSize,askSize)/oi*100:null;
  findings.push({code:'OI_DEPTH',state:!ticker||!book?'UNAVAILABLE':!fresh(ticker.timestamp)||!fresh(book.timestamp)?'STALE':ratio==null?'INSUFFICIENT':ratio<r.weakSideToOiPercent?'REVIEW':'DESCRIPTIVE',value:ratio,threshold:r.weakSideToOiPercent,sample:book?book.bids.length+book.asks.length:0,blocks:book&&ticker?[ticker.block,book.block]:[],candleTimes:[]});
  findings.push({code:'OPEN_INTEREST',state:!ticker?'UNAVAILABLE':!fresh(ticker.timestamp)?'STALE':oi==null?'INSUFFICIENT':'DESCRIPTIVE',value:oi,threshold:null,sample:oi==null?0:1,blocks:ticker?[ticker.block]:[],candleTimes:[]});
  return {rules:r,windows:[24,168,720].map(hours=>summarizeRiskWindow(data,hours)),findings,requestedHours:scope?.hours??null,bidSize,askSize,
    limitations:['Deterministic review gates; no loss probabilities or price forecasts.','Hourly volatility is sample standard deviation of adjacent log returns, not annualized.','Temporal windows are nested and share the same end; they are not independent periods.','Funding averages cover returned in-period events; absent intervals are not zero.','Open interest and depth are current provider snapshots; no historical change is inferred.','Quoted depth versus open interest is a review ratio, not executable liquidity or liquidation exposure.','No wallet positions, liquidations, P&L, leverage distribution or identity data are available.']};
}
