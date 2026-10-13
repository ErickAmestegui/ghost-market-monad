import type { PerplResult } from './perpl-intelligence.ts';

export const PERPL_CLIENT_TIMEOUT_MS = 23000;
export type PerplRequestTrace = {
  url: string; http: number | null; durationMs: number;
  parse: 'NOT_STARTED' | 'OK' | 'FAILED' | 'INVALID';
  result?: PerplResult['status']; error?: string; errorName?: string;
  cancelled: boolean; cancellation?: 'TIMEOUT' | 'UNMOUNT' | 'SUPERSEDED' | 'CANCELLED';
};
export class PerplRequestError extends Error {
  code: string;
  trace: PerplRequestTrace;
  constructor(code: string, trace: PerplRequestTrace) {
    super(code); this.name = 'PerplRequestError'; this.code=code; this.trace=trace;
  }
}
const serverCode = (value: unknown) => typeof value === 'string' && /^(INVALID_PERIOD|INVALID_MARKET|UNKNOWN_MARKET|WRONG_CHAIN|PROVIDER_BUSY|PROVIDER_OR_SCHEMA_ERROR|HTTP_\d{3})$/.test(value) ? value : null;

// Only fixed application paths and validated numeric parameters enter diagnostics.
// No response payloads, private provider URLs, headers or raw error messages are logged.
export async function fetchPerplSnapshot(id: string, period: string, options: {
  signal?: AbortSignal; deadline?: AbortSignal; fetcher?: typeof fetch;
  clock?: () => number; onTrace?: (trace: PerplRequestTrace) => void;
} = {}): Promise<PerplResult> {
  const clock = options.clock ?? (() => performance.now()), started = clock();
  const trace: PerplRequestTrace = {url:'/api/perpl-intelligence',http:null,durationMs:0,parse:'NOT_STARTED',cancelled:false};
  const deadline = options.deadline ?? AbortSignal.timeout(PERPL_CLIENT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  try {
    if (!['6','24','168','720'].includes(period) || (id && !/^[1-9]\d{0,5}$/.test(id))) throw new Error('INVALID_QUERY');
    const query = new URLSearchParams({hours:period}); if(id) query.set('marketId',id);
    trace.url += '?' + query;
    const response = await (options.fetcher ?? fetch)(trace.url,{cache:'no-store',signal});
    trace.http = response.status;
    let payload: unknown;
    try { payload = await response.json(); trace.parse = 'OK'; }
    catch (error) { trace.parse = 'FAILED'; throw error; }
    if(signal.aborted) throw signal.reason;
    const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string,unknown> : null;
    if (!response.ok) throw new Error(serverCode(body?.error) ?? `HTTP_${response.status}`);
    if (body?.status === 'UNAVAILABLE') throw new Error(serverCode(body.error) ?? 'PROVIDER_UNAVAILABLE');
    if (!body || !['AVAILABLE','PARTIAL'].includes(String(body.status)) || !Array.isArray(body.markets) || !Array.isArray(body.traces) || !body.market || typeof body.market !== 'object' || typeof body.observedAt !== 'string' || !Number.isFinite(Date.parse(body.observedAt))) {
      trace.parse = 'INVALID'; throw new Error('INVALID_RESPONSE');
    }
    const data = body as unknown as PerplResult;
    if ((id && data.market!.id !== Number(id)) || (data.requestedWindow && data.requestedWindow.hours !== Number(period))) {
      trace.parse = 'INVALID'; throw new Error('RESPONSE_SCOPE_MISMATCH');
    }
    trace.result = data.status;
    return data;
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    trace.errorName = ['AbortError','TimeoutError','SyntaxError','TypeError'].includes(name) ? name : 'Error';
    let code: string;
    if (signal.aborted) {
      trace.cancelled = true;
      if (options.signal?.aborted) {
        trace.cancellation = ['UNMOUNT','SUPERSEDED'].includes(options.signal.reason) ? options.signal.reason : 'CANCELLED';
        code = 'REQUEST_CANCELLED';
      } else { trace.cancellation = 'TIMEOUT'; code = 'CLIENT_TIMEOUT'; }
    } else if (trace.http !== null && (trace.http < 200 || trace.http >= 300)) {
      code = error instanceof Error ? serverCode(error.message) ?? `HTTP_${trace.http}` : `HTTP_${trace.http}`;
    } else if (trace.parse === 'FAILED') code = 'INVALID_JSON';
    else if (error instanceof Error && /^(INVALID_QUERY|INVALID_RESPONSE|RESPONSE_SCOPE_MISMATCH|PROVIDER_UNAVAILABLE)$/.test(error.message)) code = error.message;
    else if (error instanceof Error && serverCode(error.message)) code = error.message;
    else code = 'CLIENT_NETWORK_ERROR';
    trace.error = code; throw new PerplRequestError(code, trace);
  } finally {
    trace.durationMs = Math.max(0, Math.round(clock() - started));
    options.onTrace?.({...trace});
  }
}

export function samePerplScope(previous: {data:PerplResult;hours:string;requestedId:string} | null, id:string, hours:string) {
  return !!previous?.data.market && previous.data.status !== 'UNAVAILABLE' && previous.hours === hours && (id ? String(previous.data.market.id) === id : previous.requestedId === '');
}
