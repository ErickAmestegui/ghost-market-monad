
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
import {
  MONAD_CHAIN_ID,
  MONAD_EXPLORER_URL,
  MONAD_PUBLIC_RPC_URL,
} from "@/lib/monad/network-pulse";

type RpcResponse<T> = {
  id: number | string;
  result?: T;
  error?: { message?: string };
};

type RpcBlock = {
  number: string;
  timestamp: string;
};

function configuredRpcUrl() {
  const candidate = process.env.MONAD_RPC_URL?.trim();

  if (!candidate) return MONAD_PUBLIC_RPC_URL;

  const url = new URL(candidate);

  if (url.protocol !== "https:") {
    throw new Error("MONAD_RPC_URL must use HTTPS");
  }

  return url.toString();
}

async function rpc<T>(
  rpcUrl: string,
  method: string,
  params: unknown[],
  id: string
): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method,
      params,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(9_000),
  });

  if (!response.ok) {
    throw new Error(
      `Monad RPC ${method} returned HTTP ${response.status}`
    );
  }

  const payload = (await response.json()) as RpcResponse<T>;

  if (payload.error || payload.result == null) {
    throw new Error(
      payload.error?.message ?? `${method} returned no result`
    );
  }

  return payload.result;
}

export async function GET(request: Request) {
  const requestId = crypto.randomUUID();
  const observedAt = new Date().toISOString();

  const headers = {
    "cache-control": "public, max-age=4, s-maxage=8",
    "x-ghost-request-id": requestId,
  };

  const rawBlock = new URL(request.url).searchParams.get("toBlock");
  const historical = rawBlock !== null;

  // Only accept safe, non-negative decimal block numbers.
  if (
    historical &&
    (
      !/^\d+$/.test(rawBlock) ||
      !Number.isSafeInteger(Number(rawBlock))
    )
  ) {
    return NextResponse.json(
      {
        status: "UNAVAILABLE",
        dataMode: "HISTORICAL",
        requestId,
        observedAt,
        error: "Invalid historical block number",
      },
      {
        status: 400,
        headers: { "cache-control": "no-store" },
      }
    );
  }

  try {
    const rpcUrl = configuredRpcUrl();

    const [chainHex, latestHex, code] = await Promise.all([
      rpc<string>(rpcUrl, "eth_chainId", [], "chain"),
      rpc<string>(rpcUrl, "eth_blockNumber", [], "height"),
      rpc<string>(
        rpcUrl,
        "eth_getCode",
        [KURU_MON_USDC_MARKET, "latest"],
        "code"
      ),
    ]);

    const chainId = rpcHexToSafeNumber(chainHex, "chainId");

    if (chainId !== MONAD_CHAIN_ID) {
      throw new Error(
        `Unexpected chain ID ${chainId}; expected Monad mainnet ${MONAD_CHAIN_ID}`
      );
    }

    if (!/^0x[0-9a-f]+$/i.test(code) || code === "0x") {
      throw new Error(
        "Official Kuru MON/USDC address has no deployed bytecode"
      );
    }

    const latestBlock = rpcHexToSafeNumber(
      latestHex,
      "latestBlock"
    );

    // LIVE ends at the latest block.
    // REPLAY ends at the block selected by the user.
    const endBlock = historical
      ? Number(rawBlock)
      : latestBlock;

    if (endBlock > latestBlock) {
      return NextResponse.json(
        {
          status: "UNAVAILABLE",
          dataMode: "HISTORICAL",
          requestId,
          observedAt,
          error: "Historical block cannot be in the future",
        },
        {
          status: 400,
          headers: { "cache-control": "no-store" },
        }
      );
    }

    const firstBlock = Math.max(
      0,
      endBlock - KURU_LOOKBACK_BLOCKS + 1
    );

    const logWindows = Array.from(
      {
        length: Math.ceil(
          (endBlock - firstBlock + 1) /
            KURU_LOG_CHUNK_BLOCKS
        ),
      },
      (_, index) => {
        const from =
          firstBlock + index * KURU_LOG_CHUNK_BLOCKS;

        return {
          from,
          to: Math.min(
            endBlock,
            from + KURU_LOG_CHUNK_BLOCKS - 1
          ),
        };
      }
    );

    const selectedHex = `0x${endBlock.toString(16)}`;

    const [latestHead, selectedHead, logChunks] =
      await Promise.all([
        rpc<RpcBlock>(
          rpcUrl,
          "eth_getBlockByNumber",
          [latestHex, false],
          "latest-head"
        ),

        historical
          ? rpc<RpcBlock>(
              rpcUrl,
              "eth_getBlockByNumber",
              [selectedHex, false],
              "selected-head"
            )
          : rpc<RpcBlock>(
              rpcUrl,
              "eth_getBlockByNumber",
              [latestHex, false],
              "selected-head"
            ),

        Promise.all(
          logWindows.map((window, index) =>
            rpc<KuruRawLog[]>(
              rpcUrl,
              "eth_getLogs",
              [
                {
                  address: KURU_MON_USDC_MARKET,
                  fromBlock: `0x${window.from.toString(16)}`,
                  toBlock: `0x${window.to.toString(16)}`,
                  topics: [KURU_TRADE_TOPIC],
                },
              ],
              `trades-${index + 1}`
            )
          )
        ),
      ]);

    if (!logChunks.every(Array.isArray)) {
      throw new Error(
        "Monad RPC did not return valid Kuru log arrays"
      );
    }

    const logs = logChunks.flat();

    const decoded = logs
      .map(decodeKuruTradeLog)
      .sort(
        (a, b) =>
          a.blockNumber - b.blockNumber ||
          a.logIndex - b.logIndex
      );

    const trades = decoded.slice(-KURU_MAX_TRADES);

    const analysis = analyzeKuruFlow(trades);

    const latestTimestamp = rpcHexToSafeNumber(
      latestHead.timestamp,
      "latestHead.timestamp"
    );

    const selectedTimestamp = rpcHexToSafeNumber(
      selectedHead.timestamp,
      "selectedHead.timestamp"
    );

    const chainAgeSeconds = Math.max(
      0,
      Math.round(Date.now() / 1000 - latestTimestamp)
    );

    const ageSeconds = Math.max(
      0,
      Math.round(Date.now() / 1000 - selectedTimestamp)
    );

    const dataMode = historical
      ? "HISTORICAL"
      : "LIVE";

    return NextResponse.json(
      {
        status: historical
          ? "HISTORICAL"
          : chainAgeSeconds <= 60
            ? "LIVE"
            : "STALE",

        dataMode,
        networkStatus:
          chainAgeSeconds <= 60 ? "LIVE" : "STALE",

        requestId,
        observedAt,
        mode: "READ_ONLY",

        network: {
          name: "Monad Mainnet",
          chainId,
          explorer: MONAD_EXPLORER_URL,
        },

        protocol: {
          name: "Kuru",
          market: "MON/USDC",
          marketAddress: KURU_MON_USDC_MARKET,
          marketExplorerUrl:
            `https://monadscan.com/address/${KURU_MON_USDC_MARKET}`,
          officialContracts:
            "https://docs.kuru.io/contracts/Contract-addresses",
          eventAbi:
            "https://github.com/Kuru-Labs/Kuru-contracts-dex-public/blob/2060bb2736080c175d80d568bfdb6226bb5abd04/contracts/interfaces/IOrderBook.sol",
          contractCodeVerified: true,
        },

        window: {
          firstBlock,
          lastBlock: endBlock,
          blockCount: endBlock - firstBlock + 1,
          logRequests: logWindows.length,
          ageSeconds,
          sampledAt: new Date(
            selectedTimestamp * 1000
          ).toISOString(),
          decodedTradeCount: decoded.length,
          returnedTradeCount: trades.length,
          capped: decoded.length > trades.length,
        },

        analysis,

        trades: [...trades]
          .reverse()
          .slice(0, 12)
          .map((trade) => ({
            ...trade,
            explorerUrl:
              `${MONAD_EXPLORER_URL}/tx/${trade.transactionHash}`,
          })),

        methodology: {
          event:
            "Trade(uint40,address,bool,uint256,uint96,address,address,uint96)",
          priceScale: "1e18",
          sizePrecision: "1e10",
          thresholds: {
            minimumDirectionalTrades: 5,
            oneSidedFlowPercent: 70,
            largestTradeSharePercent: 50,
            widePriceRangeBps: 200,
          },
        },

        transactionsSubmitted: 0,

        warnings: [
          historical
            ? "Historical replay uses real Kuru Trade events from the selected block window."
            : "Live analysis uses real Kuru Trade events from recent Monad blocks.",
          "Ghost Market did not sign, submit or simulate a transaction.",
        ],
      },
      { headers }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "UNAVAILABLE",
        dataMode: historical ? "HISTORICAL" : "LIVE",
        requestId,
        observedAt,
        mode: "READ_ONLY",
        network: {
          name: "Monad Mainnet",
          chainId: MONAD_CHAIN_ID,
          explorer: MONAD_EXPLORER_URL,
        },
        protocol: {
          name: "Kuru",
          market: "MON/USDC",
          marketAddress: KURU_MON_USDC_MARKET,
        },
        error:
          error instanceof Error
            ? error.message
            : "Kuru flow evidence is unavailable",
        transactionsSubmitted: 0,
        warnings: [
          "No cached, synthetic or cross-chain fallback was substituted for Kuru evidence.",
        ],
      },
      {
        status: 503,
        headers: {
          ...headers,
          "cache-control": "no-store",
        },
      }
    );
  }
}
