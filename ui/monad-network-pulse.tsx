"use client";

import { useEffect, useState } from "react";
import { Activity, Blocks, ChevronDown, ExternalLink, Info, RadioTower, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Locale } from "@/data/types";


type PulseResponse = {
  status: "LIVE" | "STALE" | "UNAVAILABLE";
  observedAt: string;
  mode: "READ_ONLY";
  requestId: string;
  network: { name: string; chainId: number; nativeCurrency: string; explorer: string };
  source?: { name: string; documentation: string; configuredOverride: boolean };
  latestBlock?: { number: number; hash: string; timestamp: string; ageSeconds: number; transactionCount: number; explorerUrl: string };
  sample?: { size: number; firstBlock: number; lastBlock: number; totalTransactions: number; blocks: Array<{ number: number; transactionCount: number }> };
  transactions?: Array<{ hash: string; explorerUrl: string }>;
  signal?: {
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
  error?: string;
  warnings: string[];
};

const tx = (locale: Locale, en: string, es: string) => locale === "en" ? en : es;
const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

export function MonadNetworkPulse({ locale }: { locale: Locale }) {
  const [data, setData] = useState<PulseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/monad-pulse", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as PulseResponse;
        if (!response.ok && body.status !== "UNAVAILABLE") throw new Error(`HTTP ${response.status}`);
        return body;
      })
      .then((body) => setData(body))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setData({
          status: "UNAVAILABLE", observedAt: new Date().toISOString(), mode: "READ_ONLY", requestId: "CLIENT_ERROR",
          network: { name: "Monad Mainnet", chainId: 143, nativeCurrency: "MON", explorer: "https://monadvision.com" },
          error: error instanceof Error ? error.message : "Request failed", warnings: ["No simulated fallback was used."],
        });
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshToken]);

  const status = loading ? "LOADING" : data?.status ?? "UNAVAILABLE";
  return <section className="network-context">


    <details className="monad-pulse-secondary">
      <summary>
        <div className="monad-pulse-summary-copy">
          <span>MONAD NETWORK PULSE · {tx(locale, "NETWORK CONTEXT", "CONTEXTO DE RED")}</span>
          <h2>{tx(locale, "See the chain behind the market.", "Mirá la red detrás del mercado.")}</h2>
          <p>{tx(locale, "A compact, read-only view of the blocks supporting the live market evidence above.", "Una vista compacta y de solo lectura de los bloques que respaldan la evidencia de mercado anterior.")}</p>
        </div>
        <div className="monad-pulse-summary-state">
          <span className={`status-badge status-${status.toLowerCase()}`}><i />{status}</span>
          {data?.signal && <strong>{data.signal.trend} · {data.signal.density}</strong>}
          {data?.latestBlock && <small>#{data.latestBlock.number.toLocaleString("en-US")}</small>}
          <ChevronDown />
        </div>
      </summary>

      <div className="monad-pulse-content">
        <div className="monad-pulse-intro">
          <div><RadioTower /><p>{tx(locale, "Ghost samples 12 real Monad mainnet blocks and explains observed activity without treating transaction count as price, value or intent.", "Ghost toma una muestra de 12 bloques reales de Monad mainnet y explica la actividad observada sin tratar la cantidad de transacciones como precio, valor o intención.")}</p></div>
          <div className="read-only-strip"><ShieldCheck />READ ONLY · 0 {tx(locale, "transactions submitted", "transacciones enviadas")}</div>
        </div>

    <div className="monad-toolbar">
      <span className={`status-badge status-${status.toLowerCase()}`}><i />{status}</span>
      <button className="secondary-action" onClick={() => { setLoading(true); setRefreshToken((value) => value + 1); }} disabled={loading}><RefreshCw />{tx(locale, "Read latest blocks", "Leer bloques recientes")}</button>
    </div>

    {loading && !data && <div className="monad-state"><Activity /><strong>{tx(locale, "Reading Monad mainnet…", "Leyendo Monad mainnet…")}</strong></div>}
    {!loading && data?.status === "UNAVAILABLE" && <div className="monad-state monad-error"><TriangleAlert /><div><strong>{tx(locale, "Live evidence is unavailable", "La evidencia en vivo no está disponible")}</strong><p>{data.error}</p><small>{tx(locale, "Nothing cached or simulated was shown in its place.", "No se mostró información cacheada ni simulada en su lugar.")}</small></div></div>}

    {data?.latestBlock && data.sample && data.signal && <>
      <div className="monad-metrics">
        <article><span>{tx(locale, "NETWORK IDENTITY", "IDENTIDAD DE RED")}</span><strong>{data.network.name}</strong><p>Chain ID {data.network.chainId} · {data.network.nativeCurrency}</p></article>
        <article><span>{tx(locale, "LATEST REAL BLOCK", "ÚLTIMO BLOQUE REAL")}</span><strong>#{data.latestBlock.number.toLocaleString("en-US")}</strong><a href={data.latestBlock.explorerUrl} target="_blank" rel="noreferrer">{shortHash(data.latestBlock.hash)} <ExternalLink /></a></article>
        <article><span>{tx(locale, "TRANSACTIONS IN BLOCK", "TRANSACCIONES EN EL BLOQUE")}</span><strong>{data.latestBlock.transactionCount.toLocaleString("en-US")}</strong><p>{tx(locale, `Observed ${data.latestBlock.ageSeconds}s before response`, `Observado ${data.latestBlock.ageSeconds}s antes de responder`)}</p></article>
        <article><span>{tx(locale, `${data.sample.size}-BLOCK SAMPLE`, `MUESTRA DE ${data.sample.size} BLOQUES`)}</span><strong>{data.sample.totalTransactions.toLocaleString("en-US")} tx</strong><p>#{data.sample.firstBlock.toLocaleString("en-US")} → #{data.sample.lastBlock.toLocaleString("en-US")}</p></article>
      </div>

      <div className="monad-signal-grid">
        <article className="monad-signal">
          <header><div><span>{tx(locale, "DERIVED ACTIVITY SIGNAL", "SEÑAL DE ACTIVIDAD DERIVADA")}</span><h2>{data.signal.trend} · {data.signal.density}</h2></div><Activity /></header>
          <p>{locale === "en" ? data.signal.explanation : data.signal.explanationEs}</p>
          <dl>
            <div><dt>{tx(locale, "Earlier half", "Mitad anterior")}</dt><dd>{data.signal.previousAverage} tx/block</dd></div>
            <div><dt>{tx(locale, "Recent half", "Mitad reciente")}</dt><dd>{data.signal.recentAverage} tx/block</dd></div>
            <div><dt>{tx(locale, "Whole sample", "Muestra completa")}</dt><dd>{data.signal.averageTransactionsPerBlock} tx/block</dd></div>
            <div><dt>{tx(locale, "Mean interval", "Intervalo medio")}</dt><dd>{data.signal.averageBlockTimeMs == null ? "N/A" : `${data.signal.averageBlockTimeMs} ms`}</dd></div>
          </dl>
        </article>

        <article className="monad-block-strip">
          <header><span>{tx(locale, "OBSERVED BLOCKS", "BLOQUES OBSERVADOS")}</span><Blocks /></header>
          <div>{data.sample.blocks.map((block) => <span key={block.number} title={`Block ${block.number}: ${block.transactionCount} transactions`} style={{ "--tx-level": Math.max(8, Math.min(100, block.transactionCount * 2)) } as React.CSSProperties}><i />{block.transactionCount}</span>)}</div>
          <small>{tx(locale, "Bar height represents transaction count within this sample, not monetary value.", "La altura representa la cantidad de transacciones dentro de esta muestra, no valor monetario.")}</small>
        </article>
      </div>

      <div className="monad-evidence-grid">
        <article>
          <h3>{tx(locale, "Real transaction samples", "Muestras de transacciones reales")}</h3>
          {data.transactions?.length ? <div className="monad-tx-list">{data.transactions.map((item) => <a key={item.hash} href={item.explorerUrl} target="_blank" rel="noreferrer"><code>{shortHash(item.hash)}</code><ExternalLink /></a>)}</div> : <p>{tx(locale, "The latest block contained no transaction hashes to sample.", "El último bloque no contenía hashes de transacción para mostrar.")}</p>}
        </article>
        <article>
          <h3><Info />{tx(locale, "What this does not prove", "Lo que esto no demuestra")}</h3>
          <ul>{(locale === "en" ? data.signal.limitations : data.signal.limitationsEs).map((item) => <li key={item}>{item}</li>)}</ul>
        </article>
      </div>

      <details className="technical-disclosure">
        <summary><RadioTower />{tx(locale, "RPC provenance", "Procedencia RPC")}</summary>
        <div className="technical-grid">
          <div className="meta-item"><dt>{tx(locale, "Observed at", "Observado")}</dt><dd>{new Date(data.observedAt).toLocaleString(locale === "en" ? "en-US" : "es-BO")}</dd></div>
          <div className="meta-item"><dt>{tx(locale, "Block time", "Hora del bloque")}</dt><dd>{new Date(data.latestBlock.timestamp).toLocaleString(locale === "en" ? "en-US" : "es-BO")}</dd></div>
          <div className="meta-item"><dt>Request ID</dt><dd>{data.requestId}</dd></div>
        </div>
        {data.source && <a href={data.source.documentation} target="_blank" rel="noreferrer">{tx(locale, "Monad network documentation", "Documentación de la red Monad")} <ExternalLink /></a>}
      </details>
    </>}
      </div>
    </details>
  </section>;
}
