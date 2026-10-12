"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Database, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import type { BnbEvidence } from "@/data/bnb-evidence";
import type { BinanceIntegration } from "@/data/binance-integration";
import type { BinanceWeb3RwaIntegration } from "@/data/binance-web3-rwa";
import type { BinanceWalletSkillEvidence } from "@/data/binance-wallet-skill";
import type { LiveEvidence, LiveEvidenceStatus } from "@/data/live-evidence";
import type { DataStatus, Locale, SymbolKey } from "@/data/types";
import { canCalculateAfterHoursGap } from "@/lib/market-session";
import { matchesRequestedSymbol, RequestGenerationGate } from "@/lib/integration-integrity";

const tr = (locale: Locale, en: string, es: string) => locale === "en" ? en : es;
const money = (value: number | null | undefined, digits = 2) => value == null ? "—" : `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

async function fetchJsonWithOneRetry<T>(url: string, signal: AbortSignal) {
  const first = await fetch(url, { cache: "no-store", signal });
  if (first.status < 500) return first.json() as Promise<T>;
  const retry = await fetch(url, { cache: "no-store", signal });
  return retry.json() as Promise<T>;
}

export function useIntegrationEvidence(symbol: SymbolKey, enabled = true) {
  const [evidence, setEvidence] = useState<BnbEvidence | null>(null);
  const [binance, setBinance] = useState<BinanceIntegration | null>(null);
  const [rwa, setRwa] = useState<BinanceWeb3RwaIntegration | null>(null);
  const [walletSkill, setWalletSkill] = useState<BinanceWalletSkillEvidence | null>(null);
  const [live, setLive] = useState<LiveEvidence | null>(null);
  const [loadedSymbol, setLoadedSymbol] = useState<SymbolKey | null>(null);
  const [loading, setLoading] = useState(true);
  const requestGate = useRef(new RequestGenerationGate());
  const activeController = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    const version = requestGate.current!.begin();
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    setLoading(true);
    setLoadedSymbol(null);
    setEvidence(null);
    setBinance(null);
    setRwa(null);
    setWalletSkill(null);
    setLive(null);
    const now = new Date().toISOString();
    const fallback: BnbEvidence = { status: "ERROR", integrationStatus: "unavailable", network: "BSC Mainnet", chainId: 56, blockNumber: null, blockHash: null, timestamp: null, sourceName: "BNB Chain Public JSON-RPC", sourceUrl: "https://bsc-dataseed.bnbchain.org", contractName: null, contractAddress: null, valueLabel: null, value: null, explorerBlockUrl: null, explorerContractUrl: null, observedAt: now, error: "Connection unavailable", provider: "xStocks", underlyingSymbol: symbol, tokenSymbol: `${symbol}x` as BnbEvidence["tokenSymbol"], decimals: null, codePresent: false };
    const walletSkillFallback: BinanceWalletSkillEvidence = { status: "UNAVAILABLE", module: "Binance Wallet Skill · Tokenized Securities Info", provider: "Binance Skills Hub / Binance Web3 Wallet", skillVersion: "1.1", symbol, documentationUrl: "https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-tokenized-securities-info/SKILL.md", observedAt: now, latencyMs: null, requestId: "local-fallback", requests: [], asset: null, assessment: { verdict: "UNAVAILABLE", accepted: [], missing: ["Integration proof could not be loaded"], risks: ["The optional Wallet Skill adapter never blocks primary evidence"] }, error: { kind: "PROVIDER_ERROR", message: "Wallet Skill evidence could not be loaded." } };
    try {
      const [nextEvidence, nextBinance, nextLive, nextRwa, nextWalletSkill] = await Promise.all([
        fetchJsonWithOneRetry<BnbEvidence>(`/api/bnb-evidence?symbol=${symbol}`, controller.signal),
        fetch(`/api/binance-integration?symbol=${symbol}`, { cache: "no-store", signal: controller.signal }).then((response) => response.json() as Promise<BinanceIntegration>),
        fetchJsonWithOneRetry<LiveEvidence>(`/api/live-evidence?symbol=${symbol}`, controller.signal),
        fetch(`/api/binance-web3-rwa?symbol=${symbol}`, { cache: "no-store", signal: controller.signal }).then((response) => response.json() as Promise<BinanceWeb3RwaIntegration>),
        fetchJsonWithOneRetry<BinanceWalletSkillEvidence>(`/api/binance-wallet-skill?symbol=${symbol}`, controller.signal).catch(() => walletSkillFallback),
      ]);
      if (controller.signal.aborted || !requestGate.current!.isCurrent(version)) return;
      if (![nextEvidence.underlyingSymbol, nextBinance.symbol, nextLive.symbol, nextRwa.symbol, nextWalletSkill.symbol].every((actual) => matchesRequestedSymbol(symbol, actual))) {
        throw new Error("Provider responses did not match the selected asset.");
      }
      setEvidence(nextEvidence);
      setBinance(nextBinance);
      setLive(nextLive);
      setRwa(nextRwa);
      setWalletSkill(nextWalletSkill);
      setLoadedSymbol(symbol);
    } catch (caught) {
      if (controller.signal.aborted || !requestGate.current!.isCurrent(version) || (caught instanceof DOMException && caught.name === "AbortError")) return;
      setEvidence(fallback);
      setLive(null);
      setBinance({ status: "ERROR", module: "Binance Stocks Trading Market Data", provider: "Binance Developer API", symbol, endpoints: ["/sapi/v1/equity/market/tokenized-assets", `/sapi/v1/equity/market/quote?symbol=${symbol}`, `/sapi/v1/equity/market/exchangeInfo?symbol=${symbol}`], documentationUrl: "https://developers.binance.com/en/docs/catalog/advanced-trading-stocks-trading/api/rest-api/market-data", observedAt: now, latencyMs: null, requestId: "local-fallback", providerRequestId: null, responseStatus: null, requests: [], quoteMaxAgeSeconds: null, tokenizedAsset: null, quote: null, marketInfo: null, error: { kind: "PROVIDER_ERROR", message: "Integration proof could not be loaded." } });
      setRwa({ status: "ERROR", module: "Binance Web3 RWA Data API", provider: "Binance Web3 API", symbol, documentationUrl: "https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data", authenticationUrl: "https://web3.binance.com/en/dev-docs/authentication", observedAt: now, latencyMs: null, requestId: "local-fallback", responseStatus: null, credentialState: "MISSING", requests: [], assets: [], error: { kind: "PROVIDER_ERROR", message: "Integration proof could not be loaded." } });
      setWalletSkill(walletSkillFallback);
      setLoadedSymbol(symbol);
    } finally {
      if (requestGate.current!.isCurrent(version)) setLoading(false);
    }
  }, [symbol]);
  useEffect(() => {
    const gate = requestGate.current;
    if (!enabled) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      window.clearTimeout(timer);
      activeController.current?.abort();
      gate.invalidate();
    };
  }, [load, enabled]);
  const current = loadedSymbol === symbol;
  return { evidence: current ? evidence : null, binance: current ? binance : null, rwa: current ? rwa : null, walletSkill: current ? walletSkill : null, live: current ? live : null, loading: loading || !current, reload: load };
}

export function DataBadge({ status }: { status: DataStatus | LiveEvidenceStatus | "LOADING" }) {
  return <span className={`data-status status-${status.toLowerCase()}`}>{status}</span>;
}

export function BnbHeroEvidence({ locale, evidence, live, loading, onOpen }: { locale: Locale; evidence: BnbEvidence | null; live: LiveEvidence | null; loading: boolean; onOpen: () => void }) {
  const liveChainVerified = live?.verification?.some((item) => item.label === "CONTRACT EXISTS" && item.status === "LIVE") && live.verification.some((item) => item.label === "SYMBOL VERIFIED" && item.status === "LIVE");
  const verified = Boolean((evidence?.status === "LIVE" || liveChainVerified) && live?.registry?.status === "LIVE");
  const observedAt = live?.observedAt ?? evidence?.observedAt;
  const updated = observedAt ? new Date(observedAt).toLocaleTimeString(locale === "en" ? "en-US" : "es-BO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
  return <button className="bnb-hero-evidence" onClick={onOpen} aria-label={tr(locale, "View BNB Chain evidence", "Ver evidencia de BNB Chain")}>
    <div><Database/><span>BUILT ON BNB CHAIN · {live?.tokenSymbol ?? evidence?.tokenSymbol ?? "xSTOCK"}</span><DataBadge status={loading ? "LOADING" : verified ? "LIVE" : "UNAVAILABLE"}/></div>
    <dl><div><dt>{tr(locale, "NETWORK", "RED")}</dt><dd>BSC Mainnet</dd></div><div><dt>CHAIN ID</dt><dd>56</dd></div><div><dt>{tr(locale, "LAST BLOCK", "ÚLTIMO BLOQUE")}</dt><dd>{evidence?.blockNumber?.toLocaleString() ?? live?.dex?.blockNumber?.toLocaleString() ?? "—"}</dd></div><div><dt>{tr(locale, "CONNECTION", "CONEXIÓN")}</dt><dd>{verified ? tr(locale, "VERIFIED", "VERIFICADA") : tr(locale, "UNAVAILABLE", "NO DISPONIBLE")}</dd></div><div><dt>{tr(locale, "SOURCE", "FUENTE")}</dt><dd>{verified ? "xStocks + BNB RPC" : "BNB Public RPC"}</dd></div><div><dt>{tr(locale, "UPDATED", "ACTUALIZADO")}</dt><dd>{updated}</dd></div></dl>
    <p>{verified ? tr(locale, "LIVE contract + issuer provenance · market prices have independent status", "Contrato + procedencia del emisor LIVE · los precios tienen estado independiente") : tr(locale, "VERIFICATION UNAVAILABLE · NO LIVE CLAIM", "VERIFICACIÓN NO DISPONIBLE · SIN AFIRMACIÓN LIVE")}</p>
  </button>;
}

export function OnchainEvidence({ locale, evidence, binance, live, loading, reload }: { locale: Locale; evidence: BnbEvidence | null; binance: BinanceIntegration | null; live: LiveEvidence | null; loading: boolean; reload: () => void }) {
  const binanceMid = binance?.quote ? (Number(binance.quote.bidPrice) + Number(binance.quote.askPrice)) / 2 : null;
  const marketStatus = live?.market?.normalizedStatus ?? "UNKNOWN";
  const marketClosed = canCalculateAfterHoursGap(marketStatus, live?.market?.openNow);
  const proofObservedAt = live?.observedAt ? new Date(live.observedAt).getTime() : Number.NaN;
  const dexFresh = Boolean(live?.dex?.blockTimestamp && proofObservedAt - new Date(live.dex.blockTimestamp).getTime() <= 5 * 60_000);
  const binanceFresh = Boolean(binance?.observedAt && Math.abs(proofObservedAt - new Date(binance.observedAt).getTime()) <= 30_000);
  const gapReady = marketClosed && dexFresh && binanceFresh && live?.dex?.status === "LIVE" && binance?.status === "LIVE" && binanceMid !== null;
  const gapUsd = gapReady ? live!.dex.spotPriceUsd! - binanceMid! : null;
  const gapPct = gapReady ? gapUsd! / binanceMid! * 100 : null;
  const shortHash = evidence?.blockHash ? `${evidence.blockHash.slice(0, 10)}…${evidence.blockHash.slice(-8)}` : "—";
  const registry = live?.registry;
  const dex = live?.dex;
  const liveChainVerified = live?.verification?.some((item) => item.label === "CONTRACT EXISTS" && item.status === "LIVE") && live.verification.some((item) => item.label === "SYMBOL VERIFIED" && item.status === "LIVE");
  const chainStatus = evidence?.status === "LIVE" || liveChainVerified ? "LIVE" : evidence?.status ?? "ERROR";
  const chainBlock = evidence?.blockNumber ?? dex?.blockNumber ?? null;
  const chainTimestamp = evidence?.timestamp ?? dex?.blockTimestamp ?? null;

  return <section className="onchain-evidence" id="evidence">
    <div className="evidence-title"><div><span>{tr(locale, "LIVE EVIDENCE MODE", "MODO EVIDENCIA LIVE")} · BNB CHAIN</span><h2>{tr(locale, "PROVENANCE BEFORE PRICE.", "PROCEDENCIA ANTES QUE PRECIO.")}</h2><p>{tr(locale, "Every claim below has its own status. A real contract does not automatically make a market price reliable, and a moving animation never makes data live.", "Cada afirmación tiene su propio estado. Un contrato real no convierte automáticamente un precio en fiable, y una animación activa nunca convierte datos en live.")}</p></div><div className="evidence-state"><button onClick={reload} disabled={loading} aria-label={tr(locale, "Refresh integration proof", "Actualizar prueba de integración")}><RefreshCw/></button></div></div>

    <article className={`live-gap ${gapReady ? "complete" : "incomplete"}`}>
      <div className="live-gap-heading"><div><span>PRIMARY SIGNAL · LIVE AFTER-HOURS GAP</span><h3>{marketStatus === "OPEN" ? tr(locale, "PAUSED WHILE THE TRADITIONAL MARKET IS OPEN", "PAUSADA MIENTRAS EL MERCADO TRADICIONAL ESTÁ ABIERTO") : gapReady ? tr(locale, "VERIFIED GAP AVAILABLE", "BRECHA VERIFICADA DISPONIBLE") : tr(locale, "INCOMPLETE EVIDENCE", "EVIDENCIA INCOMPLETA")}</h3></div><DataBadge status={gapReady ? "LIVE" : "UNAVAILABLE"}/></div>
      <div className="live-gap-values"><div><span>{tr(locale, "ON-CHAIN PRICE", "PRECIO ON-CHAIN")}</span><strong>{dex?.status === "LIVE" ? money(dex.spotPriceUsd) : "—"}</strong><small>{dex?.status === "REJECTED" ? tr(locale, "Observed pool rejected", "Pool observado rechazado") : dex?.venue ?? "PancakeSwap V2"}</small></div><i>−</i><div><span>{tr(locale, "TRADITIONAL REFERENCE", "REFERENCIA TRADICIONAL")}</span><strong>{binance?.status === "LIVE" ? money(binanceMid) : "—"}</strong><small>Binance Developer API</small></div><i>=</i><div><span>{tr(locale, "AFTER-HOURS GAP", "BRECHA FUERA DE HORARIO")}</span><strong>{gapPct == null ? "—" : `${gapPct >= 0 ? "+" : ""}${gapPct.toFixed(2)}%`}</strong><small>{gapUsd == null ? tr(locale, "Not calculated", "No calculada") : `${gapUsd >= 0 ? "+" : ""}${money(gapUsd)}`}</small></div></div>
      <div className="live-gap-meta"><span>{tr(locale, "MARKET STATUS", "ESTADO DEL MERCADO")} <b>{marketStatus}</b></span><span>{tr(locale, "STATUS SOURCE", "FUENTE DEL ESTADO")} <b>{live?.market?.source ?? "UNAVAILABLE"}</b></span><span>{tr(locale, "OBSERVED", "OBSERVADO")} <b>{live?.market?.observedAt ? new Date(live.market.observedAt).toLocaleString(locale === "en" ? "en-US" : "es-BO") : "—"}</b></span><span>{tr(locale, "NEXT CHANGE", "PRÓXIMO CAMBIO")} <b>{live?.market?.nextChangeAt ? new Date(live.market.nextChangeAt).toLocaleString(locale === "en" ? "en-US" : "es-BO") : "—"}</b></span><span>{tr(locale, "TIMEZONE", "ZONA HORARIA")} <b>{live?.market?.timezone ?? "America/New_York"}</b></span><span>{tr(locale, "LIQUIDITY", "LIQUIDEZ")} <b>{dex?.liquidityUsd == null ? "—" : money(dex.liquidityUsd)}</b></span></div>
      {!gapReady && <p className="gap-warning"><TriangleAlert/>{marketStatus === "OPEN" ? tr(locale, "Ghost Market will not label a regular-session difference as an after-hours gap.", "Ghost Market no etiqueta una diferencia de sesión regular como brecha fuera de horario.") : tr(locale, "The gap stays blank until the session is CLOSED or AFTER-HOURS, Binance returns a fresh reference, and an accepted on-chain market is fresh. Simulated scores are never substituted.", "La brecha queda vacía hasta que la sesión sea CLOSED o AFTER-HOURS, Binance entregue una referencia reciente y exista un mercado on-chain aceptado y reciente. Nunca se sustituyen con scores simulados.")}</p>}
    </article>

    <div className="verification-ladder">{(live?.verification ?? []).map((item) => <a key={item.label} href={item.url ?? undefined} target={item.url ? "_blank" : undefined} rel="noreferrer"><ShieldCheck/><span>{item.label}<small>{item.detail}</small></span><DataBadge status={item.status}/></a>)}</div>

    <div className="proof-grid proof-grid-wide">
      <article className="proof-card"><header><div><span>OFFICIAL XSTOCKS REGISTRY</span><b>{registry?.assetName ?? live?.tokenSymbol ?? "Asset provenance"}</b></div><DataBadge status={loading ? "LOADING" : registry?.status ?? "UNAVAILABLE"}/></header><dl><EvidenceItem label={tr(locale, "PROVIDER", "PROVEEDOR")} value={registry?.provider ?? "xStocks / Backed Assets"}/><EvidenceItem label="ISIN" value={registry?.isin ?? "—"}/><EvidenceItem label={tr(locale, "OFFICIAL BSC CONTRACT", "CONTRATO BSC OFICIAL")} value={registry?.contractAddress ?? "UNAVAILABLE"} href={registry?.contractAddress ? `https://bscscan.com/token/${registry.contractAddress}` : null}/><EvidenceItem label={tr(locale, "REGISTRY RESPONSE", "RESPUESTA DEL REGISTRO")} value={registry?.apiUrl ?? "UNAVAILABLE"} href={registry?.apiUrl}/><EvidenceItem label={tr(locale, "ISSUER DOCUMENTATION", "DOCUMENTACIÓN DEL EMISOR")} value="Backed Assets legal documentation" href={registry?.legalUrl}/></dl></article>
      <article className="proof-card"><header><div><span>BNB CHAIN PUBLIC RPC</span><b>eth_getCode · symbol() · totalSupply()</b></div><DataBadge status={loading ? "LOADING" : chainStatus}/></header><dl><EvidenceItem label={tr(locale, "CONTRACT", "CONTRATO")} value={evidence?.contractAddress ?? registry?.contractAddress ?? "UNAVAILABLE"} href={evidence?.explorerContractUrl ?? (registry?.contractAddress ? `https://bscscan.com/token/${registry.contractAddress}` : null)}/><EvidenceItem label={tr(locale, "CHAIN / BLOCK", "CADENA / BLOQUE")} value={`${evidence?.chainId ?? 56} / ${chainBlock?.toLocaleString() ?? "—"}`} href={evidence?.explorerBlockUrl ?? (chainBlock ? `https://bscscan.com/block/${chainBlock}` : null)}/><EvidenceItem label="BLOCK HASH" value={shortHash}/><EvidenceItem label={evidence?.valueLabel ?? tr(locale, "ON-CHAIN VALUE", "VALOR ON-CHAIN")} value={evidence?.value ?? (liveChainVerified ? tr(locale, "Bytecode + symbol verified by live evidence route", "Bytecode + símbolo verificados por la ruta de evidencia live") : "UNAVAILABLE")}/><EvidenceItem label={tr(locale, "TIMESTAMP", "MARCA DE TIEMPO")} value={chainTimestamp ? new Date(chainTimestamp).toLocaleString(locale === "en" ? "en-US" : "es-BO") : "—"}/></dl></article>
      <article className="proof-card"><header><div><span>BINANCE DEVELOPER API</span><b>Stocks Trading Market Data</b></div><DataBadge status={loading ? "LOADING" : binance?.status ?? "UNAVAILABLE"}/></header><dl><EvidenceItem label={tr(locale, "ENDPOINTS USED", "ENDPOINTS USADOS")} value={binance?.requests.length ? binance.requests.map((item) => item.endpoint.split("/").at(-1)).join(" · ") : "tokenized-assets · quote · exchangeInfo"} href={binance?.documentationUrl}/><EvidenceItem label={tr(locale, "REQUESTED ASSET", "ACTIVO SOLICITADO")} value={binance?.symbol ?? "UNAVAILABLE"}/><EvidenceItem label={tr(locale, "RETURNED IDENTIFIER", "IDENTIFICADOR DEVUELTO")} value={binance?.tokenizedAsset ? `${binance.tokenizedAsset.assetCode} · ${binance.tokenizedAsset.assetName}` : "UNAVAILABLE"}/><EvidenceItem label={tr(locale, "REFERENCE QUOTE", "COTIZACIÓN DE REFERENCIA")} value={binanceMid == null ? "UNAVAILABLE" : money(binanceMid)}/><EvidenceItem label={tr(locale, "TRADABILITY", "OPERABILIDAD")} value={binance?.marketInfo?.tradability ?? "UNAVAILABLE"}/><EvidenceItem label={tr(locale, "MARKET STATUS", "ESTADO DEL MERCADO")} value={marketStatus}/><EvidenceItem label="GHOST REQUEST ID" value={binance?.requestId ?? "—"}/><EvidenceItem label="PROVIDER REQUEST ID" value={binance?.providerRequestId ?? tr(locale, "Not supplied", "No proporcionado")}/><EvidenceItem label="HTTP STATUS" value={binance?.responseStatus?.toString() ?? "—"}/><EvidenceItem label={tr(locale, "LATENCY", "LATENCIA")} value={binance?.latencyMs == null ? "—" : `${binance.latencyMs} ms`}/><EvidenceItem label={tr(locale, "GHOST RECEIPT TIME", "HORA DE RECEPCIÓN DE GHOST")} value={binance?.observedAt ? new Date(binance.observedAt).toLocaleString(locale === "en" ? "en-US" : "es-BO") : "—"}/><EvidenceItem label={tr(locale, "PROVIDER SOURCE TIME", "HORA DE ORIGEN DEL PROVEEDOR")} value={tr(locale, "Not supplied · freshness CACHED", "No proporcionada · frescura CACHED")}/></dl>{binance?.error && <p className="proof-error"><b>{binance.error.kind}</b> · {binance.error.message}</p>}</article>
    </div>

    <div className="dex-proof"><div><span>PANCAKESWAP V2 · VERIFIED POOL CHECK</span><h3>{dex?.status === "LIVE" ? tr(locale, "MARKET ACCEPTED", "MERCADO ACEPTADO") : dex?.status === "REJECTED" ? tr(locale, "WEAK SIGNAL REJECTED", "SEÑAL DÉBIL RECHAZADA") : tr(locale, "NO VERIFIED MARKET FOUND", "NO SE ENCONTRÓ UN MERCADO VERIFICADO")}</h3><p>{dex?.rejectionReason ?? (dex?.status === "LIVE" ? tr(locale, "Pool passed the minimum liquidity and price-impact controls.", "El pool superó los controles mínimos de liquidez e impacto de precio.") : tr(locale, "Checking official deployments and verified BNB markets. No price is promoted before validation.", "Comprobando despliegues oficiales y mercados BNB verificados. Ningún precio se publica antes de validarlo."))}</p></div><dl><EvidenceItem label={tr(locale, "PAIR", "PAR")} value={dex?.pairAddress ?? "UNAVAILABLE"} href={dex?.explorerUrl}/><EvidenceItem label={tr(locale, "OBSERVED SPOT", "SPOT OBSERVADO")} value={money(dex?.spotPriceUsd)}/><EvidenceItem label={tr(locale, "POOL LIQUIDITY", "LIQUIDEZ DEL POOL")} value={money(dex?.liquidityUsd)}/><EvidenceItem label={tr(locale, "PRICE IMPACT · $100", "IMPACTO DE PRECIO · $100")} value={dex?.priceImpact100UsdPct == null ? "—" : `${dex.priceImpact100UsdPct.toFixed(2)}%`}/><EvidenceItem label={tr(locale, "POOL FEE / SPREAD", "COMISIÓN / SPREAD")} value={`${dex?.poolFeeBps ?? 25} bps / ${tr(locale, "spread unavailable", "spread no disponible")}`}/><EvidenceItem label={tr(locale, "BLOCK", "BLOQUE")} value={dex?.blockNumber?.toLocaleString() ?? "—"} href={dex?.blockNumber ? `https://bscscan.com/block/${dex.blockNumber}` : null}/></dl></div>

    <div className="availability-grid"><div><span>{tr(locale, "OFFICIAL REFERENCE", "REFERENCIA OFICIAL")}</span><DataBadge status={live?.reference?.status ?? "UNAVAILABLE"}/><p>{live?.reference?.priceUsd ? `${money(live.reference.priceUsd)} · ${tr(locale, "provider timestamp not supplied", "timestamp del proveedor no incluido")}` : tr(locale, "No xStocks reference returned.", "xStocks no devolvió referencia.")}</p></div><div><span>{tr(locale, "ORACLE PROVENANCE", "PROCEDENCIA DEL ORÁCULO")}</span><DataBadge status={live?.oracle?.status ?? "UNAVAILABLE"}/><p>{live?.oracle?.provider ? `${live.oracle.provider} · ${live.oracle.feedType} · ${live.oracle.feedId?.slice(0, 14)}…` : tr(locale, "No BSC oracle metadata returned.", "No se devolvieron metadatos del oráculo BSC.")}</p></div><div><span>{tr(locale, "AGENT / WALLET PROOF", "PRUEBA DE AGENTE / WALLET")}</span><span className="data-status status-unavailable">NOT IMPLEMENTED</span><p>{tr(locale, "No wallet connected. 0 transactions created. No connection, signature, Wallet Skill or transaction is simulated.", "No hay wallet conectada. 0 transacciones creadas. No se simula conexión, firma, Wallet Skill ni transacción.")}</p></div></div>
    <div className="provenance-note"><b>{tr(locale, "PROVENANCE RULE", "REGLA DE PROCEDENCIA")}</b><p>{tr(locale, "LIVE means a value was read during this request from a verifiable source. CACHED is real provider data without request-time freshness. REJECTED is a real observation that failed quality controls. SIMULATED belongs only to the deterministic demo.", "LIVE significa que el valor se leyó durante esta solicitud desde una fuente verificable. CACHED es dato real del proveedor sin frescura de la solicitud. REJECTED es una observación real que falló controles de calidad. SIMULATED pertenece solo a la demo determinista.")}</p><small>Request ID: {live?.requestId ?? "—"} · {live?.latencyMs == null ? "—" : `${live.latencyMs} ms`} · {live?.observedAt ? new Date(live.observedAt).toISOString() : "—"}</small></div>
  </section>;
}

function EvidenceItem({ label, value, href }: { label: string; value: string; href?: string | null }) {
  const content = <><span>{label}</span><strong>{value}</strong>{href && <ArrowUpRight/>}</>;
  return href ? <a href={href} target="_blank" rel="noreferrer">{content}</a> : <div>{content}</div>;
}
