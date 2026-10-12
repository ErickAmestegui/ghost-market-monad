import { NextResponse } from "next/server";
import {
  KURU_LOOKBACK_BLOCKS,
  KURU_LOG_CHUNK_BLOCKS,
  KURU_MAX_TRADES,
  KURU_MON_USDC_MARKET,
  KURU_TRADE_TOPIC,
  analyzeKuruFlow,
  decodeKuruTradeLog,
  rpcHexToSafeNumber,
  type KuruRawLog,
} from "@/lib/monad/kuru-flow";
import { MONAD_CHAIN_ID, MONAD_EXPLORER_URL, MONAD_PUBLIC_RPC_URL } from "@/lib/monad/network-pulse";

type RpcResponse<T> = { id: number | string; result?: T; error?: { message?: string } };
type RpcBlock = { number: string; timestamp: string };

function configuredRpcUrl() {
  const candidate = process.env.MONAD_RPC_URL?.trim();
  if (!candidate) return MONAD_PUBLIC_RPC_URL;
  const url = new URL(candidate);
  if (url.protocol !== "https:") throw new Error("MONAD_RPC_URL must use HTTPS");
  return url.toString();
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[], id: string): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    cache: "no-store",
    signal: AbortSignal.timeout(9_000),
  });
  if (!response.ok) throw new Error(`Monad RPC ${method} returned HTTP ${response.status}`);
  const payload = await response.json() as RpcResponse<T>;
  if (payload.error || payload.result === undefined) throw new Error(payload.error?.message ?? `${method} returned no result`);
  return payload.result;
}

export async function GET() {
  const requestId = crypto.randomUUID();
  const observedAt = new Date().toISOString();
  const headers = { "cache-control": "public, max-age=4, s-maxage=8", "x-ghost-request-id": requestId };
  try {
    const rpcUrl = configuredRpcUrl();
    const [chainHex, latestHex, code] = await Promise.all([
      rpc<string>(rpcUrl, "eth_chainId", [], "chain"),
      rpc<string>(rpcUrl, "eth_blockNumber", [], "height"),
      rpc<string>(rpcUrl, "eth_getCode", [KURU_MON_USDC_MARKET, "latest"], "code"),
    ]);
    const chainId = rpcHexToSafeNumber(chainHex, "chainId");
    if (chainId !== MONAD_CHAIN_ID) throw new Error(`Unexpected chain ID ${chainId}; expected Monad mainnet ${MONAD_CHAIN_ID}`);
    if (!/^0x[0-9a-f]+$/i.test(code) || code === "0x") throw new Error("Official Kuru MON/USDC address has no deployed bytecode");
    const latestBlock = rpcHexToSafeNumber(latestHex, "latestBlock");
    const firstBlock = Math.max(0, latestBlock - KURU_LOOKBACK_BLOCKS + 1);
    const logWindows = Array.from({ length: Math.ceil((latestBlock - firstBlock + 1) / KURU_LOG_CHUNK_BLOCKS) }, (_, index) => {
      const from = firstBlock + index * KURU_LOG_CHUNK_BLOCKS;
      return { from, to: Math.min(latestBlock, from + KURU_LOG_CHUNK_BLOCKS - 1) };
    });
    const [head, logChunks] = await Promise.all([
      rpc<RpcBlock>(rpcUrl, "eth_getBlockByNumber", [latestHex, false], "head"),
      Promise.all(logWindows.map((window, index) => rpc<KuruRawLog[]>(rpcUrl, "eth_getLogs", [{
        address: KURU_MON_USDC_MARKET,
        fromBlock: `0x${window.from.toString(16)}`,
        toBlock: `0x${window.to.toString(16)}`,
        topics: [KURU_TRADE_TOPIC],
      }], `trades-${index + 1}`))),
    ]);
    const logs = logChunks.flat();
    if (!Array.isArray(logs)) throw new Error("Monad RPC did not return a Kuru log array");
    const decoded = logs.map(decodeKuruTradeLog).sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
    const trades = decoded.slice(-KURU_MAX_TRADES);
    const analysis = analyzeKuruFlow(trades);
    const latestTimestamp = rpcHexToSafeNumber(head.timestamp, "head.timestamp");
    const ageSeconds = Math.max(0, Math.round((Date.now() - latestTimestamp * 1_000) / 1_000));

    return NextResponse.json({
      status: ageSeconds <= 60 ? "LIVE" : "STALE",
      requestId,
      observedAt,
      mode: "READ_ONLY",
      network: { name: "Monad Mainnet", chainId, explorer: MONAD_EXPLORER_URL },
      protocol: {
        name: "Kuru",
        market: "MON/USDC",
        marketAddress: KURU_MON_USDC_MARKET,
        marketExplorerUrl: `https://monadscan.com/address/${KURU_MON_USDC_MARKET}`,
        officialContracts: "https://docs.kuru.io/contracts/Contract-addresses",
        eventAbi: "https://github.com/Kuru-Labs/Kuru-contracts-dex-public/blob/2060bb2736080c175d80d568bfdb6226bb5abd04/contracts/interfaces/IOrderBook.sol",
        contractCodeVerified: true,
      },
      window: { firstBlock, lastBlock: latestBlock, blockCount: latestBlock - firstBlock + 1, logRequests: logWindows.length, ageSeconds, decodedTradeCount: decoded.length, returnedTradeCount: trades.length, capped: decoded.length > trades.length },
      analysis,
      trades: [...trades].reverse().slice(0, 12).map((trade) => ({
        ...trade,
        explorerUrl: `${MONAD_EXPLORER_URL}/tx/${trade.transactionHash}`,
      })),
      methodology: {
        event: "Trade(uint40,address,bool,uint256,uint96,address,address,uint96)",
        priceScale: "1e18",
        sizePrecision: "1e10",
        thresholds: { minimumDirectionalTrades: 5, oneSidedFlowPercent: 70, largestTradeSharePercent: 50, widePriceRangeBps: 200 },
      },
      transactionsSubmitted: 0,
      warnings: ["Read-only analysis of emitted Kuru Trade events. Ghost Market did not sign, submit or simulate a transaction."],
    }, { headers });
  } catch (error) {
    return NextResponse.json({
      status: "UNAVAILABLE",
      requestId,
      observedAt,
      mode: "READ_ONLY",
      network: { name: "Monad Mainnet", chainId: MONAD_CHAIN_ID, explorer: MONAD_EXPLORER_URL },
      protocol: { name: "Kuru", market: "MON/USDC", marketAddress: KURU_MON_USDC_MARKET },
      error: error instanceof Error ? error.message : "Kuru flow evidence is unavailable",
      transactionsSubmitted: 0,
      warnings: ["No cached, synthetic or cross-chain fallback was substituted for live Kuru evidence."],
    }, { status: 503, headers: { ...headers, "cache-control": "no-store" } });
  }
}
