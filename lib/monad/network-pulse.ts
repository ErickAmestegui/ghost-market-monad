export const MONAD_CHAIN_ID = 143;
export const MONAD_NETWORK_NAME = "Monad Mainnet";
export const MONAD_PUBLIC_RPC_URL = "https://rpc.monad.xyz";
export const MONAD_EXPLORER_URL = "https://monadvision.com";
export const MONAD_SAMPLE_SIZE = 12;

export type MonadBlockSample = {
  number: number;
  hash: string;
  timestamp: number;
  transactionCount: number;
};

export type MonadActivitySignal = {
  trend: "RISING" | "STEADY" | "COOLING" | "QUIET";
  density: "LOW" | "MODERATE" | "HIGH";
  averageTransactionsPerBlock: number;
  recentAverage: number;
  previousAverage: number;
  changePercent: number | null;
  averageBlockTimeMs: number | null;
  explanation: string;
  explanationEs: string;
  limitations: string[];
  limitationsEs: string[];
};

const mean = (values: number[]) => values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
const rounded = (value: number, digits = 2) => Number(value.toFixed(digits));

export function hexToSafeNumber(value: string, field: string) {
  if (!/^0x[0-9a-f]+$/i.test(value)) throw new Error(`${field} is not valid RPC hex`);
  const parsed = Number(BigInt(value));
  if (!Number.isSafeInteger(parsed)) throw new Error(`${field} exceeds JavaScript's safe integer range`);
  return parsed;
}

export function deriveMonadActivitySignal(samples: MonadBlockSample[]): MonadActivitySignal {
  if (samples.length < 4) throw new Error("At least four Monad blocks are required to derive an activity signal");
  const ordered = [...samples].sort((a, b) => a.number - b.number);
  const counts = ordered.map((block) => block.transactionCount);
  const split = Math.floor(counts.length / 2);
  const previousAverage = mean(counts.slice(0, split));
  const recentAverage = mean(counts.slice(split));
  const averageTransactionsPerBlock = mean(counts);
  const difference = recentAverage - previousAverage;
  const changePercent = previousAverage === 0 ? null : difference / previousAverage * 100;

  let trend: MonadActivitySignal["trend"] = "STEADY";
  if (averageTransactionsPerBlock === 0) trend = "QUIET";
  else if (difference >= 2 && (changePercent === null || changePercent >= 25)) trend = "RISING";
  else if (difference <= -2 && changePercent !== null && changePercent <= -25) trend = "COOLING";

  const density: MonadActivitySignal["density"] = averageTransactionsPerBlock < 10
    ? "LOW"
    : averageTransactionsPerBlock < 50 ? "MODERATE" : "HIGH";
  const intervals = ordered.slice(1).map((block, index) => (block.timestamp - ordered[index].timestamp) * 1_000).filter((value) => value >= 0);
  const averageBlockTimeMs = intervals.length > 0 ? rounded(mean(intervals), 0) : null;
  const trendReason = trend === "QUIET"
    ? "No transactions appeared in the sampled blocks."
    : trend === "STEADY"
      ? `Recent activity (${rounded(recentAverage)} tx/block) stayed within the ±25% and two-transaction change gates versus the earlier half (${rounded(previousAverage)} tx/block).`
      : `Recent activity averaged ${rounded(recentAverage)} tx/block versus ${rounded(previousAverage)} in the earlier half, a ${changePercent === null ? "new" : `${rounded(Math.abs(changePercent), 1)}%`} ${trend === "RISING" ? "increase" : "decrease"}.`;
  const trendReasonEs = trend === "QUIET"
    ? "No aparecieron transacciones en los bloques de la muestra."
    : trend === "STEADY"
      ? `La actividad reciente (${rounded(recentAverage)} tx/bloque) se mantuvo dentro de los límites de ±25 % y dos transacciones frente a la mitad anterior (${rounded(previousAverage)} tx/bloque).`
      : `La actividad reciente promedió ${rounded(recentAverage)} tx/bloque frente a ${rounded(previousAverage)} en la mitad anterior: ${changePercent === null ? "actividad nueva" : `${rounded(Math.abs(changePercent), 1)} % de ${trend === "RISING" ? "aumento" : "disminución"}`}.`;

  return {
    trend,
    density,
    averageTransactionsPerBlock: rounded(averageTransactionsPerBlock),
    recentAverage: rounded(recentAverage),
    previousAverage: rounded(previousAverage),
    changePercent: changePercent === null ? null : rounded(changePercent, 1),
    averageBlockTimeMs,
    explanation: `${trendReason} Density is ${density.toLowerCase()} under fixed descriptive bands: low <10, moderate 10–49.99, high ≥50 transactions per block.`,
    explanationEs: `${trendReasonEs} La densidad es ${density === "LOW" ? "baja" : density === "MODERATE" ? "moderada" : "alta"} según bandas descriptivas fijas: baja <10, moderada 10–49,99, alta ≥50 transacciones por bloque.`,
    limitations: [
      `Derived from only the latest ${ordered.length} blocks at request time.`,
      "Transaction count does not measure value, intent, unique users, liquidity or execution quality.",
      "The signal describes observed activity only; it is not a price forecast or trading recommendation.",
    ],
    limitationsEs: [
      `Se deriva únicamente de los últimos ${ordered.length} bloques al momento de la consulta.`,
      "La cantidad de transacciones no mide valor, intención, usuarios únicos, liquidez ni calidad de ejecución.",
      "La señal solo describe actividad observada; no es un pronóstico de precio ni una recomendación de trading.",
    ],
  };
}
