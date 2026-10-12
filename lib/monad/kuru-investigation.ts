import { KURU_MON_USDC_MARKET, KURU_TRADE_TOPIC, KURU_LOOKBACK_BLOCKS, KURU_LOG_CHUNK_BLOCKS, KURU_MAX_TRADES, analyzeKuruFlow, decodeKuruTradeLog, rpcHexToSafeNumber, type KuruRawLog, type KuruTrade } from './kuru-flow.ts';
import { MONAD_CHAIN_ID, MONAD_EXPLORER_URL, MONAD_PUBLIC_RPC_URL } from './network-pulse.ts';

export const HISTORICAL_EXAMPLE_BLOCK = 112682099;
export type EvidenceTrade = KuruTrade & { blockHash?: string; rawData?: string; rawTopics?: string[] };
export type Investigation = {
  status: 'LIVE' | 'STALE' | 'REPLAYED' | 'UNAVAILABLE' | 'CONFIG_REQUIRED';
  requestId: string; observedAt: string; mode: 'LIVE' | 'HISTORICAL';
  provider: string;
  window?: { firstBlock: number; lastBlock: number; blockCount: number; ageSeconds?: number; decodedTradeCount: number; returnedTradeCount: number; capped: boolean };
  analysis?: ReturnType<typeof analyzeKuruFlow>; trades?: EvidenceTrade[]; error?: string; warnings: string[];
};
export function parseInvestigationRange(from: string | null, to: string | null, max = KURU_LOOKBACK_BLOCKS) {
  if (!from || !to || !/^\d+$/.test(from) || !/^\d+$/.test(to)) throw new Error('INVALID_RANGE');
  const first = Number(from), last = Number(to);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last + 1) || first < 0 || last < first || last - first + 1 > max) throw new Error('INVALID_RANGE');
  return { firstBlock: first, lastBlock: last };
}
export const tradeKey = (trade: KuruTrade) => `${trade.transactionHash}:${trade.logIndex}`;
export function validateTradeWindow<T extends KuruTrade>(trades: T[], first: number, last: number) {
  const seen = new Set<string>();
  for (const trade of trades) {
    if (trade.blockNumber < first || trade.blockNumber > last || seen.has(tradeKey(trade))) throw new Error('INVALID_EVIDENCE_WINDOW');
    seen.add(tradeKey(trade));
  }
  return [...trades].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
}
// Provider text and credential-bearing URLs are never reflected to the browser.
export function safeInvestigationError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'INVALID_RANGE') return 'INVALID_RANGE';
  if (/^PROVIDER_HTTP_\d{3}$/.test(message)) return message;
  if (message === 'WRONG_CHAIN') return 'WRONG_CHAIN';
  if (message === 'FUTURE_RANGE') return 'FUTURE_RANGE';
  if (message === 'NO_CONTRACT') return 'NO_CONTRACT';
  if (error instanceof Error && /timeout|abort/i.test(error.name)) return 'PROVIDER_TIMEOUT';
  return 'PROVIDER_OR_EVIDENCE_ERROR';
}
export async function readKuruRpc(options: { range?: { firstBlock: number; lastBlock: number }; rpcUrl?: string; fetcher?: typeof fetch; now?: number }): Promise<Investigation> {
  const fetcher = options.fetcher ?? fetch;
  const rpcUrl = options.rpcUrl?.trim() || MONAD_PUBLIC_RPC_URL;
  if (new URL(rpcUrl).protocol !== 'https:') throw new Error('INVALID_RPC_CONFIG');
  const deadline = AbortSignal.timeout(20000);
  const rpc = async <T>(method: string, params: unknown[]): Promise<T> => {
    const response = await fetcher(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }), cache: 'no-store', signal: deadline });
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    const payload = await response.json() as { result?: T; error?: unknown };
    if (payload.error || payload.result == null) throw new Error('RPC_ERROR');
    return payload.result;
  };
  const [chain, height, code] = await Promise.all([rpc<string>('eth_chainId', []), rpc<string>('eth_blockNumber', []), rpc<string>('eth_getCode', [KURU_MON_USDC_MARKET, 'latest'])]);
  if (rpcHexToSafeNumber(chain, 'chain') !== MONAD_CHAIN_ID) throw new Error('WRONG_CHAIN');
  if (!/^0x[0-9a-f]+$/i.test(code) || code === '0x') throw new Error('NO_CONTRACT');
  const latest = rpcHexToSafeNumber(height, 'height');
  const range = options.range ?? { firstBlock: Math.max(0, latest - KURU_LOOKBACK_BLOCKS + 1), lastBlock: latest };
  parseInvestigationRange(String(range.firstBlock), String(range.lastBlock));
  if (range.lastBlock > latest) throw new Error('FUTURE_RANGE');
  const hex = (n: number) => `0x${n.toString(16)}`;
  const windows = Array.from({ length: Math.ceil((range.lastBlock - range.firstBlock + 1) / KURU_LOG_CHUNK_BLOCKS) }, (_, i) => ({ from: range.firstBlock + i * KURU_LOG_CHUNK_BLOCKS, to: Math.min(range.lastBlock, range.firstBlock + (i + 1) * KURU_LOG_CHUNK_BLOCKS - 1) }));
  const [head, chunks] = await Promise.all([
    rpc<{ number: string; timestamp: string }>('eth_getBlockByNumber', [hex(range.lastBlock), false]),
    Promise.all(windows.map(w => rpc<Array<KuruRawLog & { blockHash: string }>>('eth_getLogs', [{ address: KURU_MON_USDC_MARKET, fromBlock: hex(w.from), toBlock: hex(w.to), topics: [KURU_TRADE_TOPIC] }]))),
  ]);
  if (rpcHexToSafeNumber(head.number, 'head.number') !== range.lastBlock || chunks.some(c => !Array.isArray(c))) throw new Error('INVALID_RPC_EVIDENCE');
  const raw = chunks.flat();
  if (raw.length > 5000) throw new Error('EVIDENCE_LIMIT');
  const decoded = validateTradeWindow(raw.map(log => {
    if (!/^0x[0-9a-f]{64}$/i.test(log.blockHash)) throw new Error('INVALID_BLOCK_HASH');
    return { ...decodeKuruTradeLog(log), blockHash: log.blockHash.toLowerCase(), rawData: log.data, rawTopics: log.topics };
  }), range.firstBlock, range.lastBlock);
  const trades = decoded.slice(-KURU_MAX_TRADES);
  const now = options.now ?? Date.now();
  const ageSeconds = Math.max(0, Math.round((now - rpcHexToSafeNumber(head.timestamp, 'timestamp') * 1000) / 1000));
  return { status: options.range ? 'REPLAYED' : ageSeconds <= 60 ? 'LIVE' : 'STALE', requestId: crypto.randomUUID(), observedAt: new Date(now).toISOString(), mode: options.range ? 'HISTORICAL' : 'LIVE', provider: 'Monad JSON-RPC', window: { ...range, blockCount: range.lastBlock - range.firstBlock + 1, ageSeconds, decodedTradeCount: decoded.length, returnedTradeCount: trades.length, capped: decoded.length > trades.length }, analysis: analyzeKuruFlow(trades), trades: [...trades].reverse(), warnings: ['RPC event evidence; no claim of finality. Metrics use the returned sample of at most 60 trades.'] };
}
export function compareInvestigations(left: Investigation, right: Investigation) {
  if (!left.window || !right.window || !left.analysis || !right.analysis || left.window.capped || right.window.capped) return null;
  return { leftCount: left.analysis.tradeCount, rightCount: right.analysis.tradeCount,
    leftVolumePerBlock: left.analysis.totalVolumeMon / left.window.blockCount,
    rightVolumePerBlock: right.analysis.totalVolumeMon / right.window.blockCount,
    vwapDeltaPercent: left.analysis.vwapUsd == null || right.analysis.vwapUsd == null ? null : (right.analysis.vwapUsd / left.analysis.vwapUsd - 1) * 100,
    imbalanceDeltaPoints: left.analysis.tradeCount === 0 || right.analysis.tradeCount === 0 ? null : right.analysis.imbalancePercent - left.analysis.imbalancePercent };
}
export const evidenceLinks = (trade: KuruTrade) => ({ transaction: `${MONAD_EXPLORER_URL}/tx/${trade.transactionHash}`, block: `${MONAD_EXPLORER_URL}/block/${trade.blockNumber}` });
