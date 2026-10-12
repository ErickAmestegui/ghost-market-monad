import { NextResponse } from "next/server";
import { safeInvestigationError } from "@/lib/monad/kuru-investigation";
import {
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  MONAD_NETWORK_NAME,
  MONAD_PUBLIC_RPC_URL,
  MONAD_SAMPLE_SIZE,
  deriveMonadActivitySignal,
  hexToSafeNumber,
  type MonadBlockSample,
} from "@/lib/monad/network-pulse";

type RpcResponse<T> = { id: number | string; result?: T; error?: { code?: number; message?: string } };
type RpcBlock = { number: string; hash: string; timestamp: string; transactions: string[] };

function configuredRpcUrl() {
  const candidate = process.env.MONAD_RPC_URL?.trim();
  if (!candidate) return MONAD_PUBLIC_RPC_URL;
  const url = new URL(candidate);
  if (url.protocol !== "https:") throw new Error("MONAD_RPC_URL must use HTTPS");
  return url.toString();
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[], id: number | string): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Monad RPC returned HTTP ${response.status}`);
  const payload = await response.json() as RpcResponse<T>;
  if (payload.error || payload.result === undefined) throw new Error(payload.error?.message ?? `${method} returned no result`);
  return payload.result;
}

async function rpcBlocks(rpcUrl: string, blockNumbers: number[]) {
  const requests = blockNumbers.map((blockNumber, index) => ({
    jsonrpc: "2.0", id: index + 1, method: "eth_getBlockByNumber", params: [`0x${blockNumber.toString(16)}`, false],
  }));
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requests),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Monad RPC block batch returned HTTP ${response.status}`);
  const payload = await response.json() as Array<RpcResponse<RpcBlock>>;
  if (!Array.isArray(payload)) throw new Error("Monad RPC did not return a batch response");
  const byId = new Map(payload.map((entry) => [Number(entry.id), entry]));
  return requests.map((_, index) => {
    const entry = byId.get(index + 1);
    if (!entry?.result || entry.error) throw new Error(entry?.error?.message ?? "A sampled Monad block was unavailable");
    return entry.result;
  });
}

export async function GET() {
  const requestId = crypto.randomUUID();
  const observedAt = new Date().toISOString();
  const headers = { "cache-control": "public, max-age=4, s-maxage=8", "x-ghost-request-id": requestId };
  try {
    const rpcUrl = configuredRpcUrl();
    const [chainHex, latestHex] = await Promise.all([
      rpc<string>(rpcUrl, "eth_chainId", [], "chain"),
      rpc<string>(rpcUrl, "eth_blockNumber", [], "height"),
    ]);
    const chainId = hexToSafeNumber(chainHex, "chainId");
    if (chainId !== MONAD_CHAIN_ID) throw new Error(`Unexpected chain ID ${chainId}; expected Monad mainnet ${MONAD_CHAIN_ID}`);
    const latestBlockNumber = hexToSafeNumber(latestHex, "blockNumber");
    const firstBlockNumber = Math.max(0, latestBlockNumber - MONAD_SAMPLE_SIZE + 1);
    const blockNumbers = Array.from({ length: latestBlockNumber - firstBlockNumber + 1 }, (_, index) => firstBlockNumber + index);
    const blocks = await rpcBlocks(rpcUrl, blockNumbers);
    const samples: MonadBlockSample[] = blocks.map((block) => ({
      number: hexToSafeNumber(block.number, "block.number"),
      hash: block.hash,
      timestamp: hexToSafeNumber(block.timestamp, "block.timestamp"),
      transactionCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
    }));
    const latest = samples.at(-1);
    const latestRaw = blocks.at(-1);
    if (!latest || !latestRaw) throw new Error("Monad RPC returned no sampled blocks");
    const latestBlockTime = new Date(latest.timestamp * 1_000).toISOString();
    const ageSeconds = Math.max(0, Math.round((Date.now() - latest.timestamp * 1_000) / 1_000));
    const status = ageSeconds <= 60 ? "LIVE" : "STALE";
    const signal = deriveMonadActivitySignal(samples);

    return NextResponse.json({
      status,
      requestId,
      observedAt,
      mode: "READ_ONLY",
      network: { name: MONAD_NETWORK_NAME, chainId, nativeCurrency: "MON", explorer: MONAD_EXPLORER_URL },
      source: { name: "Monad public JSON-RPC", documentation: "https://docs.monad.xyz/developer-essentials/network-information", configuredOverride: rpcUrl !== MONAD_PUBLIC_RPC_URL },
      latestBlock: {
        number: latest.number,
        hash: latest.hash,
        timestamp: latestBlockTime,
        ageSeconds,
        transactionCount: latest.transactionCount,
        explorerUrl: `${MONAD_EXPLORER_URL}/block/${latest.number}`,
      },
      sample: {
        size: samples.length,
        firstBlock: samples[0].number,
        lastBlock: latest.number,
        totalTransactions: samples.reduce((sum, block) => sum + block.transactionCount, 0),
        blocks: samples,
      },
      transactions: latestRaw.transactions.slice(0, 5).map((hash) => ({ hash, explorerUrl: `${MONAD_EXPLORER_URL}/tx/${hash}` })),
      signal,
      transactionsSubmitted: 0,
      warnings: ["Read-only observation: Ghost Market did not sign, submit or simulate any transaction."],
    }, { headers });
  } catch (error) {
    return NextResponse.json({
      status: "UNAVAILABLE",
      requestId,
      observedAt,
      mode: "READ_ONLY",
      network: { name: MONAD_NETWORK_NAME, chainId: MONAD_CHAIN_ID, nativeCurrency: "MON", explorer: MONAD_EXPLORER_URL },
      error: safeInvestigationError(error),
      transactionsSubmitted: 0,
      warnings: ["No cached or simulated fallback was substituted for live Monad data."],
    }, { status: 503, headers: { ...headers, "cache-control": "no-store" } });
  }
}
