import {
  KURU_MON_USDC_MARKET,
  KURU_TRADE_TOPIC,
  decodeKuruTradeLog,
  type KuruRawLog,
  type KuruTrade,
} from "./kuru-flow.ts";

export const ENVIO_MONAD_HYPERSYNC_URL = "https://monad.hypersync.xyz";
export const KURU_REPLAY_MAX_BLOCKS = 10_000;
export const KURU_REPLAY_MAX_PAGES = 20;

type HyperSyncQuantity = number | string;

export type HyperSyncLog = {
  address?: string;
  block_hash?: string;
  block_number?: HyperSyncQuantity;
  data?: string;
  log_index?: HyperSyncQuantity;
  removed?: boolean;
  topic0?: string;
  transaction_hash?: string;
};

export type HyperSyncBlock = {
  hash?: string;
  number?: HyperSyncQuantity;
  timestamp?: HyperSyncQuantity;
};

export type HyperSyncQueryResponse = {
  archive_height?: HyperSyncQuantity;
  next_block?: HyperSyncQuantity;
  total_execution_time?: number;
  data?: { blocks?: HyperSyncBlock[]; logs?: HyperSyncLog[] };
  rollback_guard?: {
    block_number?: HyperSyncQuantity;
    hash?: string;
    first_block_number?: HyperSyncQuantity;
    first_parent_hash?: string;
  } | null;
};

export type KuruReplayTrade = KuruTrade & { blockHash: string };

const HASH = /^0x[0-9a-f]{64}$/i;

export function parseHyperSyncQuantity(value: HyperSyncQuantity, field: string) {
  if (typeof value === "string" && !/^(?:\d+|0x[0-9a-f]+)$/i.test(value)) throw new Error(`${field} is missing or invalid`);
  const parsed = typeof value === "number"
    ? value
    : /^0x[0-9a-f]+$/i.test(value) ? Number(BigInt(value)) : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${field} is not a safe non-negative integer`);
  return parsed;
}

export function buildKuruReplayQuery(fromBlock: number, toBlockInclusive: number) {
  if (!Number.isSafeInteger(fromBlock) || !Number.isSafeInteger(toBlockInclusive + 1) || fromBlock < 0 || toBlockInclusive < fromBlock) {
    throw new Error("Replay block range is invalid");
  }
  const blockCount = toBlockInclusive - fromBlock + 1;
  if (blockCount > KURU_REPLAY_MAX_BLOCKS) throw new Error(`Replay range cannot exceed ${KURU_REPLAY_MAX_BLOCKS} blocks`);
  return {
    from_block: fromBlock,
    to_block: toBlockInclusive + 1,
    logs: [{ address: [KURU_MON_USDC_MARKET], topics: [[KURU_TRADE_TOPIC]] }],
    field_selection: {
      block: ["number", "hash", "timestamp"],
      log: ["block_number", "block_hash", "log_index", "transaction_hash", "address", "data", "topic0", "removed"],
    },
  };
}

export function decodeHyperSyncKuruLog(log: HyperSyncLog): KuruReplayTrade {
  if (!log.block_hash || !HASH.test(log.block_hash)) throw new Error("HyperSync log is missing a valid block hash");
  const raw: KuruRawLog = {
    address: log.address ?? "",
    blockNumber: `0x${parseHyperSyncQuantity(log.block_number ?? "", "block_number").toString(16)}`,
    data: log.data ?? "",
    logIndex: `0x${parseHyperSyncQuantity(log.log_index ?? "", "log_index").toString(16)}`,
    topics: [log.topic0 ?? ""],
    transactionHash: log.transaction_hash ?? "",
    removed: log.removed ?? false,
  };
  return { ...decodeKuruTradeLog(raw), blockHash: log.block_hash.toLowerCase() };
}

export function decodeHyperSyncKuruPage(payload: HyperSyncQueryResponse) {
  if (!payload.data || !Array.isArray(payload.data.logs) || !Array.isArray(payload.data.blocks)) {
    throw new Error("HyperSync returned an invalid data envelope");
  }
  const nextBlock = parseHyperSyncQuantity(payload.next_block ?? "", "next_block");
  const archiveHeight = payload.archive_height == null ? null : parseHyperSyncQuantity(payload.archive_height, "archive_height");
  const blockHashes = new Map<number, string>();
  for (const block of payload.data.blocks) {
    const number = parseHyperSyncQuantity(block.number ?? "", "block.number");
    if (!block.hash || !HASH.test(block.hash)) throw new Error("HyperSync block is missing a valid hash");
    blockHashes.set(number, block.hash.toLowerCase());
  }
  const trades = payload.data.logs.map(decodeHyperSyncKuruLog);
  for (const trade of trades) {
    const joinedHash = blockHashes.get(trade.blockNumber);
    if (!joinedHash || joinedHash !== trade.blockHash) throw new Error(`HyperSync block hash mismatch or missing join at block ${trade.blockNumber}`);
  }
  return { nextBlock, archiveHeight, trades, blocks: blockHashes.size };
}

// Separate provider path: callers choose Envio explicitly; this never invokes RPC.
export async function readEnvioReplay(fromBlock: number, toBlock: number, token: string, fetcher: typeof fetch = fetch) {
  const query = buildKuruReplayQuery(fromBlock, toBlock);
  const deadline = AbortSignal.timeout(25000);
  let cursor = fromBlock, pages = 0, archiveHeight: number | null = null, providerExecutionMs = 0;
  const trades: KuruReplayTrade[] = [];
  const keys = new Set<string>();
  while (cursor < query.to_block) {
    if (pages >= KURU_REPLAY_MAX_PAGES) throw new Error('PAGINATION_LIMIT');
    const response = await fetcher(`${ENVIO_MONAD_HYPERSYNC_URL}/query`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...query, from_block: cursor }), cache: 'no-store', signal: deadline });
    if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
    const payload = await response.json() as HyperSyncQueryResponse;
    const page = decodeHyperSyncKuruPage(payload);
    if (page.nextBlock <= cursor || page.nextBlock > query.to_block) throw new Error('INVALID_PAGINATION');
    for (const trade of page.trades) {
      const key = `${trade.transactionHash}:${trade.logIndex}`;
      if (trade.blockNumber < cursor || trade.blockNumber >= page.nextBlock || keys.has(key)) throw new Error('INVALID_PAGE_EVIDENCE');
      keys.add(key); trades.push(trade);
    }
    if (trades.length > 5000) throw new Error('EVIDENCE_LIMIT');
    if (payload.total_execution_time != null && (!Number.isFinite(payload.total_execution_time) || payload.total_execution_time < 0)) throw new Error('INVALID_EXECUTION_TIME');
    archiveHeight = page.archiveHeight ?? archiveHeight;
    providerExecutionMs += payload.total_execution_time ?? 0;
    cursor = page.nextBlock; pages++;
  }
  trades.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  return { trades, pages, archiveHeight, providerExecutionMs };
}
