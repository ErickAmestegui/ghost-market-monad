import {readPerpl,type PerplResult} from './perpl-intelligence.ts';
import {createBoundedProviderCache} from './bounded-provider-cache.ts';
const read=createBoundedProviderCache<PerplResult>({ttlMs:5000,maxEntries:8,maxConcurrent:2});
export function readCachedPerpl(marketId:number|undefined,hours:number=24){return read(`${marketId??'MON'}:${hours}`,()=>readPerpl({marketId,hours}));}
