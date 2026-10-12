"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, ExternalLink, Fingerprint, RefreshCw, Scale, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Locale } from "@/data/types";
import type { KuruFlowAnalysis, KuruTrade } from "@/lib/monad/kuru-flow";

type KuruResponse = {
  status: "LIVE" | "STALE" | "UNAVAILABLE";
  requestId: string;
  observedAt: string;
  protocol: { name: string; market: string; marketAddress: string; marketExplorerUrl?: string; officialContracts?: string; eventAbi?: string; contractCodeVerified?: boolean };
  window?: { firstBlock: number; lastBlock: number; blockCount: number; ageSeconds: number; decodedTradeCount: number; returnedTradeCount: number; capped: boolean };
  analysis?: KuruFlowAnalysis;
  trades?: Array<KuruTrade & { explorerUrl: string }>;
  methodology?: { event: string; priceScale: string; sizePrecision: string; thresholds: Record<string, number> };
  error?: string;
  warnings: string[];
};

const copy = (locale: Locale, en: string, es: string) => locale === "en" ? en : es;
const money = (value: number | null | undefined, max = 5) => value == null ? "—" : `$${value.toLocaleString("en-US", { maximumFractionDigits: max })}`;
const number = (value: number | null | undefined, max = 2) => value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: max });
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;

export function KuruFlowIntelligence({ locale }: { locale: Locale }) {
  const [data, setData] = useState<KuruResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/kuru-flow", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as KuruResponse;
        if (!response.ok && body.status !== "UNAVAILABLE") throw new Error(`HTTP ${response.status}`);
        return body;
      })
      .then(setData)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setData({ status: "UNAVAILABLE", requestId: "CLIENT_ERROR", observedAt: new Date().toISOString(), protocol: { name: "Kuru", market: "MON/USDC", marketAddress: "0x065C9d28E428A0db40191a54d33d5b7c71a9C394" }, error: error instanceof Error ? error.message : "Request failed", warnings: ["No simulated fallback was used."] });
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refreshToken]);

  const analysis = data?.analysis;
  const status = loading ? "LOADING" : data?.status ?? "UNAVAILABLE";
  const maxTrade = Math.max(...(data?.trades?.map((trade) => trade.sizeMon) ?? [1]), 1);
  return <section className="kuru-lab" aria-labelledby="kuru-flow-title">
    <header className="kuru-lab-header">
      <div className="kuru-title-copy">
        <p className="eyebrow">KURU FLOW FORENSICS · {copy(locale, "REAL MARKET EVENTS", "EVENTOS REALES DE MERCADO")}</p>
        <h1 id="kuru-flow-title">{copy(locale, "What actually traded?", "¿Qué se operó realmente?")}</h1>
        <p>{copy(locale, "Ghost decodes the official MON/USDC order book’s Trade events and separates executed flow from speculation.", "Ghost decodifica los eventos Trade del order book oficial MON/USDC y separa el flujo ejecutado de la especulación.")}</p>
      </div>
      <div className="kuru-hero-side">
        <div className="kuru-hero-mark"><div aria-hidden="true" /><Image src="/ghost-companion.png" alt={copy(locale, "Ghost investigating Kuru market flow", "Ghost investigando el flujo de mercado de Kuru")} width={190} height={190} priority /><span><Fingerprint />{copy(locale, "LIVE ORDER FLOW", "FLUJO LIVE DE ÓRDENES")}</span></div>
        <div className="kuru-lab-actions"><span className={`status-badge status-${status.toLowerCase()}`}><i />{status}</span><button className="secondary-action" onClick={() => { setLoading(true); setRefreshToken((value) => value + 1); }} disabled={loading}><RefreshCw />{copy(locale, "Refresh trades", "Actualizar operaciones")}</button></div>
      </div>
    </header>

    {loading && !data && <div className="kuru-state"><Activity /><strong>{copy(locale, "Scanning verified Kuru events…", "Buscando eventos verificados de Kuru…")}</strong></div>}
    {!loading && data?.status === "UNAVAILABLE" && <div className="kuru-state kuru-error"><TriangleAlert /><div><strong>{copy(locale, "Live Kuru evidence is unavailable", "La evidencia en vivo de Kuru no está disponible")}</strong><p>{data.error}</p><small>{copy(locale, "No cache, simulation or BNB data was shown instead.", "No se mostraron datos cacheados, simulados ni de BNB en su lugar.")}</small></div></div>}

    {analysis && data?.window && <>
      <div className="kuru-verdict">
        <div className={`kuru-classification ${analysis.classification.toLowerCase()}`}><Fingerprint /><span>{copy(locale, "FLOW CLASSIFICATION", "CLASIFICACIÓN DE FLUJO")}</span><strong>{analysis.classification.replaceAll("_", " ")}</strong></div>
        <p>{locale === "en" ? analysis.explanation : analysis.explanationEs}</p>
        <div className="kuru-window"><span>{copy(locale, "VERIFIED WINDOW", "VENTANA VERIFICADA")}</span><strong>#{data.window.firstBlock.toLocaleString("en-US")} → #{data.window.lastBlock.toLocaleString("en-US")}</strong><small>{data.window.blockCount.toLocaleString("en-US")} {copy(locale, "blocks", "bloques")} · {data.window.ageSeconds}s {copy(locale, "old", "de antigüedad")}</small></div>
      </div>

      <div className="kuru-metrics">
        <article><span>{copy(locale, "EXECUTED TRADES", "OPERACIONES EJECUTADAS")}</span><strong>{analysis.tradeCount}</strong><p>{analysis.buyCount} buys · {analysis.sellCount} sells</p></article>
        <article><span>{copy(locale, "MON VOLUME", "VOLUMEN MON")}</span><strong>{number(analysis.totalVolumeMon)} MON</strong><p>{money(analysis.totalNotionalUsd, 2)} {copy(locale, "observed notional", "nocional observado")}</p></article>
        <article><span>VWAP</span><strong>{money(analysis.vwapUsd, 6)}</strong><p>{copy(locale, "Last", "Último")}: {money(analysis.lastPriceUsd, 6)}</p></article>
        <article><span>{copy(locale, "AGGRESSOR IMBALANCE", "DESEQUILIBRIO AGRESOR")}</span><strong className={analysis.netAggressorFlowMon >= 0 ? "positive" : "negative"}>{analysis.netAggressorFlowMon >= 0 ? "+" : ""}{number(analysis.netAggressorFlowMon)} MON</strong><p>{analysis.imbalancePercent >= 0 ? "+" : ""}{analysis.imbalancePercent}%</p></article>
        <article><span>{copy(locale, "UNIQUE TAKERS", "TAKERS ÚNICOS")}</span><strong>{analysis.uniqueTakers}</strong><p>{copy(locale, "Address count, not identity", "Cantidad de direcciones, no identidad")}</p></article>
      </div>

      <div className="kuru-grid">
        <article className="kuru-tape">
          <header><div><span>{copy(locale, "VERIFIED TRADE TAPE", "CINTA VERIFICADA")}</span><h3>{data.protocol.market} · Kuru</h3></div><Scale /></header>
          {data.trades?.length ? <div className="trade-tape">{data.trades.map((trade) => <a key={`${trade.transactionHash}-${trade.logIndex}`} href={trade.explorerUrl} target="_blank" rel="noreferrer">
            <span className={`trade-side ${trade.side.toLowerCase()}`}>{trade.side === "BUY" ? <ArrowUpRight /> : <ArrowDownRight />}{trade.side}</span>
            <span className="trade-size"><i style={{ width: `${Math.max(5, trade.sizeMon / maxTrade * 100)}%` }} />{number(trade.sizeMon, 4)} MON</span>
            <strong>{money(trade.priceUsd, 6)}</strong><code>#{trade.blockNumber.toLocaleString("en-US")}</code><ExternalLink />
          </a>)}</div> : <div className="kuru-empty">{copy(locale, "No Trade events were emitted in this verified window.", "No se emitieron eventos Trade en esta ventana verificada.")}</div>}
        </article>

        <article className="kuru-flags">
          <header><div><span>{copy(locale, "HONEST REVIEW FLAGS", "BANDERAS HONESTAS")}</span><h3>{copy(locale, "Evidence, not accusations", "Evidencia, no acusaciones")}</h3></div><ShieldAlert /></header>
          {analysis.flags.length ? <div>{analysis.flags.map((flag) => <section key={flag.code} className={flag.severity.toLowerCase()}><TriangleAlert /><div><strong>{flag.code.replaceAll("_", " ")}</strong><p>{locale === "en" ? flag.explanation : flag.explanationEs}</p></div></section>)}</div> : <div className="no-flags"><ShieldCheck /><div><strong>{copy(locale, "No rule crossed", "Ninguna regla se activó")}</strong><p>{copy(locale, "This does not prove the market is safe; it only means these four transparent tests did not fire.", "Esto no demuestra que el mercado sea seguro; solo indica que estas cuatro pruebas transparentes no se activaron.")}</p></div></div>}
          <dl><div><dt>{copy(locale, "Price range", "Rango de precio")}</dt><dd>{analysis.priceRangeBps == null ? "—" : `${number(analysis.priceRangeBps)} bps`}</dd></div><div><dt>{copy(locale, "Largest print", "Mayor operación")}</dt><dd>{analysis.largestTradeSharePercent == null ? "—" : `${number(analysis.largestTradeSharePercent)}%`}</dd></div></dl>
        </article>
      </div>

      <div className="kuru-proof">
        <div><ShieldCheck /><p><span>{copy(locale, "OFFICIAL CONTRACT", "CONTRATO OFICIAL")}</span><strong>{short(data.protocol.marketAddress)}</strong><small>{copy(locale, "Bytecode verified through Monad RPC", "Bytecode verificado mediante RPC de Monad")}</small></p></div>
        {data.protocol.marketExplorerUrl && <a href={data.protocol.marketExplorerUrl} target="_blank" rel="noreferrer">{copy(locale, "Open market contract", "Abrir contrato del mercado")} <ExternalLink /></a>}
        {data.protocol.officialContracts && <a href={data.protocol.officialContracts} target="_blank" rel="noreferrer">{copy(locale, "Official Kuru addresses", "Direcciones oficiales de Kuru")} <ExternalLink /></a>}
      </div>

      <details className="technical-disclosure kuru-method">
        <summary><Fingerprint />{copy(locale, "Methodology and limits", "Metodología y límites")}</summary>
        <div className="technical-grid"><div className="meta-item"><dt>Event ABI</dt><dd>{data.methodology?.event ?? "Trade"}</dd></div><div className="meta-item"><dt>Request ID</dt><dd>{data.requestId}</dd></div><div className="meta-item"><dt>{copy(locale, "Observed", "Observado")}</dt><dd>{new Date(data.observedAt).toLocaleString(locale === "en" ? "en-US" : "es-BO")}</dd></div></div>
        <ul>{(locale === "en" ? analysis.limitations : analysis.limitationsEs).map((item) => <li key={item}>{item}</li>)}</ul>
      </details>
    </>}
  </section>;
}
