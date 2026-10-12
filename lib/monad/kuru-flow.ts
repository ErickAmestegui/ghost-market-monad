export const KURU_MON_USDC_MARKET = "0x065C9d28E428A0db40191a54d33d5b7c71a9C394";
export const KURU_TRADE_TOPIC = "0xf16924fba1c18c108912fcacaac7450c98eb3f2d8c0a3cdf3df7066c08f21581";
// Monad's public RPC accepts eth_getLogs windows below 100 blocks reliably.
// The route scans this larger horizon through independent 90-block requests.
export const KURU_LOOKBACK_BLOCKS = 720;
export const KURU_LOG_CHUNK_BLOCKS = 90;
export const KURU_MAX_TRADES = 60;
export const KURU_SIZE_PRECISION = 10_000_000_000n;
export const KURU_PRICE_PRECISION = 1_000_000_000_000_000_000n;

export type KuruRawLog = {
  address: string;
  blockNumber: string;
  data: string;
  logIndex: string;
  topics: string[];
  transactionHash: string;
  removed?: boolean;
};

export type KuruTrade = {
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  orderId: number;
  makerAddress: string;
  takerAddress: string;
  txOrigin: string;
  side: "BUY" | "SELL";
  priceUsd: number;
  sizeMon: number;
  notionalUsd: number;
  orderRemainingMon: number;
};

export type KuruFlowFlag = {
  code: "SPARSE_SAMPLE" | "ONE_SIDED_FLOW" | "LARGE_TRADE_CONCENTRATION" | "WIDE_PRICE_RANGE";
  severity: "INFO" | "WATCH";
  explanation: string;
  explanationEs: string;
};

export type KuruFlowAnalysis = {
  classification: "INSUFFICIENT" | "BALANCED" | "BUY_PRESSURE" | "SELL_PRESSURE" | "WATCH";
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  buyVolumeMon: number;
  sellVolumeMon: number;
  totalVolumeMon: number;
  totalNotionalUsd: number;
  netAggressorFlowMon: number;
  imbalancePercent: number;
  vwapUsd: number | null;
  lastPriceUsd: number | null;
  priceRangeBps: number | null;
  largestTradeSharePercent: number | null;
  uniqueTakers: number;
  flags: KuruFlowFlag[];
  explanation: string;
  explanationEs: string;
  limitations: string[];
  limitationsEs: string[];
};

const HEX_32_BYTES = /^[0-9a-f]{64}$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const rounded = (value: number, digits = 4) => Number(value.toFixed(digits));

export function rpcHexToSafeNumber(value: string, field: string) {
  if (!/^0x[0-9a-f]+$/i.test(value)) throw new Error(`${field} is not valid RPC hex`);
  const parsed = Number(BigInt(value));
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} exceeds JavaScript's safe integer range`);
  return parsed;
}

function wordToAddress(word: string, field: string) {
  if (!HEX_32_BYTES.test(word) || !/^0{24}/i.test(word)) throw new Error(`${field} is not an ABI address word`);
  const address = `0x${word.slice(24)}`;
  if (!ADDRESS.test(address)) throw new Error(`${field} is not an EVM address`);
  return address.toLowerCase();
}

function scaledNumber(value: bigint, precision: bigint, field: string) {
  const integer = value / precision;
  const fraction = value % precision;
  const parsed = Number(integer) + Number(fraction) / Number(precision);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${field} cannot be represented safely`);
  return parsed;
}

export function decodeKuruTradeLog(log: KuruRawLog): KuruTrade {
  if (log.removed) throw new Error("Removed Kuru logs are not accepted as evidence");
  if (log.address.toLowerCase() !== KURU_MON_USDC_MARKET.toLowerCase()) throw new Error("Unexpected Kuru market address");
  if (log.topics.length !== 1 || log.topics[0]?.toLowerCase() !== KURU_TRADE_TOPIC) throw new Error("Unexpected Kuru event topic");
  if (!/^0x[0-9a-f]{512}$/i.test(log.data)) throw new Error("Kuru Trade event data must contain eight ABI words");
  if (!/^0x[0-9a-f]{64}$/i.test(log.transactionHash)) throw new Error("Invalid transaction hash");

  const words = Array.from({ length: 8 }, (_, index) => log.data.slice(2 + index * 64, 2 + (index + 1) * 64));
  if (words.some((word) => !HEX_32_BYTES.test(word))) throw new Error("Malformed Kuru Trade ABI word");
  const boolWord = BigInt(`0x${words[2]}`);
  if (boolWord !== 0n && boolWord !== 1n) throw new Error("Kuru Trade side is not a valid boolean");
  const orderId = Number(BigInt(`0x${words[0]}`));
  if (!Number.isSafeInteger(orderId)) throw new Error("Kuru order ID exceeds the safe integer range");
  const priceUsd = scaledNumber(BigInt(`0x${words[3]}`), KURU_PRICE_PRECISION, "price");
  const orderRemainingMon = scaledNumber(BigInt(`0x${words[4]}`), KURU_SIZE_PRECISION, "updatedSize");
  const sizeMon = scaledNumber(BigInt(`0x${words[7]}`), KURU_SIZE_PRECISION, "filledSize");
  if (priceUsd <= 0 || sizeMon <= 0) throw new Error("Kuru Trade price and filled size must be positive");

  return {
    blockNumber: rpcHexToSafeNumber(log.blockNumber, "blockNumber"),
    logIndex: rpcHexToSafeNumber(log.logIndex, "logIndex"),
    transactionHash: log.transactionHash.toLowerCase(),
    orderId,
    makerAddress: wordToAddress(words[1], "makerAddress"),
    side: boolWord === 1n ? "BUY" : "SELL",
    priceUsd: rounded(priceUsd, 8),
    orderRemainingMon: rounded(orderRemainingMon, 8),
    takerAddress: wordToAddress(words[5], "takerAddress"),
    txOrigin: wordToAddress(words[6], "txOrigin"),
    sizeMon: rounded(sizeMon, 8),
    notionalUsd: rounded(priceUsd * sizeMon, 4),
  };
}

export function analyzeKuruFlow(trades: KuruTrade[]): KuruFlowAnalysis {
  const ordered = [...trades].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
  const buys = ordered.filter((trade) => trade.side === "BUY");
  const sells = ordered.filter((trade) => trade.side === "SELL");
  const sumSize = (items: KuruTrade[]) => items.reduce((sum, trade) => sum + trade.sizeMon, 0);
  const buyVolumeMon = sumSize(buys);
  const sellVolumeMon = sumSize(sells);
  const totalVolumeMon = buyVolumeMon + sellVolumeMon;
  const totalNotionalUsd = ordered.reduce((sum, trade) => sum + trade.notionalUsd, 0);
  const netAggressorFlowMon = buyVolumeMon - sellVolumeMon;
  const imbalancePercent = totalVolumeMon === 0 ? 0 : netAggressorFlowMon / totalVolumeMon * 100;
  const largestTradeSharePercent = totalVolumeMon === 0 ? null : Math.max(...ordered.map((trade) => trade.sizeMon)) / totalVolumeMon * 100;
  const vwapUsd = totalVolumeMon === 0 ? null : ordered.reduce((sum, trade) => sum + trade.priceUsd * trade.sizeMon, 0) / totalVolumeMon;
  const prices = ordered.map((trade) => trade.priceUsd);
  const priceRangeBps = vwapUsd == null || prices.length < 2 ? null : (Math.max(...prices) - Math.min(...prices)) / vwapUsd * 10_000;
  const flags: KuruFlowFlag[] = [];

  if (ordered.length < 5) flags.push({
    code: "SPARSE_SAMPLE", severity: "INFO",
    explanation: "Fewer than five trades were observed, so directional claims are withheld.",
    explanationEs: "Se observaron menos de cinco operaciones, por lo que no se hacen afirmaciones direccionales.",
  });
  if (ordered.length >= 5 && Math.abs(imbalancePercent) >= 70) flags.push({
    code: "ONE_SIDED_FLOW", severity: "WATCH",
    explanation: `Aggressor flow was ${Math.abs(imbalancePercent).toFixed(1)}% net ${imbalancePercent > 0 ? "buying" : "selling"} by MON volume.`,
    explanationEs: `El flujo agresor fue ${Math.abs(imbalancePercent).toFixed(1)} % neto de ${imbalancePercent > 0 ? "compra" : "venta"} por volumen en MON.`,
  });
  if (ordered.length >= 3 && largestTradeSharePercent != null && largestTradeSharePercent >= 50) flags.push({
    code: "LARGE_TRADE_CONCENTRATION", severity: "WATCH",
    explanation: `The largest print represented ${largestTradeSharePercent.toFixed(1)}% of observed MON volume.`,
    explanationEs: `La mayor operación representó ${largestTradeSharePercent.toFixed(1)} % del volumen observado en MON.`,
  });
  if (ordered.length >= 5 && priceRangeBps != null && priceRangeBps >= 200) flags.push({
    code: "WIDE_PRICE_RANGE", severity: "WATCH",
    explanation: `Observed prices spanned ${priceRangeBps.toFixed(0)} bps around the volume-weighted average.`,
    explanationEs: `Los precios observados abarcaron ${priceRangeBps.toFixed(0)} pb alrededor del promedio ponderado por volumen.`,
  });

  const watch = flags.some((flag) => flag.severity === "WATCH");
  const classification: KuruFlowAnalysis["classification"] = ordered.length < 5
    ? "INSUFFICIENT"
    : watch ? "WATCH"
      : imbalancePercent >= 25 ? "BUY_PRESSURE"
        : imbalancePercent <= -25 ? "SELL_PRESSURE" : "BALANCED";
  const directional = imbalancePercent > 0 ? "net aggressive buying" : imbalancePercent < 0 ? "net aggressive selling" : "balanced aggressive flow";
  const directionalEs = imbalancePercent > 0 ? "compra agresiva neta" : imbalancePercent < 0 ? "venta agresiva neta" : "flujo agresor equilibrado";

  return {
    classification,
    tradeCount: ordered.length,
    buyCount: buys.length,
    sellCount: sells.length,
    buyVolumeMon: rounded(buyVolumeMon, 4),
    sellVolumeMon: rounded(sellVolumeMon, 4),
    totalVolumeMon: rounded(totalVolumeMon, 4),
    totalNotionalUsd: rounded(totalNotionalUsd, 2),
    netAggressorFlowMon: rounded(netAggressorFlowMon, 4),
    imbalancePercent: rounded(imbalancePercent, 1),
    vwapUsd: vwapUsd == null ? null : rounded(vwapUsd, 8),
    lastPriceUsd: ordered.at(-1)?.priceUsd ?? null,
    priceRangeBps: priceRangeBps == null ? null : rounded(priceRangeBps, 1),
    largestTradeSharePercent: largestTradeSharePercent == null ? null : rounded(largestTradeSharePercent, 1),
    uniqueTakers: new Set(ordered.map((trade) => trade.takerAddress)).size,
    flags,
    explanation: ordered.length < 5
      ? `Only ${ordered.length} verified trade${ordered.length === 1 ? "" : "s"} appeared in this short window. Ghost reports the evidence but withholds a directional conclusion.`
      : `${ordered.length} verified Kuru trades show ${directional} of ${Math.abs(netAggressorFlowMon).toFixed(2)} MON. This describes executed order flow, not future price direction.`,
    explanationEs: ordered.length < 5
      ? `Solo aparecieron ${ordered.length} operaciones verificadas en esta ventana corta. Ghost muestra la evidencia, pero no concluye una dirección.`
      : `${ordered.length} operaciones verificadas en Kuru muestran ${directionalEs} de ${Math.abs(netAggressorFlowMon).toFixed(2)} MON. Esto describe flujo ejecutado, no la dirección futura del precio.`,
    limitations: [
      "The window is block-based and intentionally short; it is not a complete market history.",
      "Aggressor side and wallet concentration do not establish identity, intent, manipulation or profitability.",
      "Flags are deterministic review prompts, not alerts to buy, sell or execute a trade.",
    ],
    limitationsEs: [
      "La ventana se basa en bloques y es intencionalmente corta; no es un historial completo del mercado.",
      "El lado agresor y la concentración de wallets no establecen identidad, intención, manipulación ni rentabilidad.",
      "Las banderas son indicios deterministas para revisar, no alertas para comprar, vender o ejecutar una operación.",
    ],
  };
}
