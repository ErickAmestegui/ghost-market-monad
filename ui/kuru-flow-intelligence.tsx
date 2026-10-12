"use client";

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, ArrowRight, Download, ExternalLink, Fingerprint, History, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { Locale } from '@/data/types';
import { KURU_MON_USDC_MARKET } from '@/lib/monad/kuru-flow';
import { HISTORICAL_EXAMPLE_BLOCK, compareInvestigations, evidenceLinks, tradeKey, type EvidenceTrade, type Investigation } from '@/lib/monad/kuru-investigation';
import { MonadNetworkPulse } from '@/ui/monad-network-pulse';

export type InvestigationView = 'home' | 'live' | 'historical' | 'explorer';
const t = (l: Locale, en: string, es: string) => l === 'en' ? en : es;
const n = (value: number | null | undefined, l: Locale, digits = 4) => value == null ? '—' : value.toLocaleString(l === 'en' ? 'en-US' : 'es-BO', { maximumFractionDigits: digits });
const signed = (value: number, locale: Locale, unit: string) => (value > 0 ? '+' : '') + n(value, locale, 2) + unit;
const price = (value: number | null | undefined, l: Locale) => value == null ? '—' : `${n(value, l, 8)} USDC`;
const errorCopy = (code: string | undefined, l: Locale) => {
  if (code === 'ENVIO_TOKEN_REQUIRED') return t(l, 'Envio historical queries require a server API token. Choose Monad RPC to continue investigating.', 'Las consultas históricas de Envio requieren un token de API en el servidor. Elige Monad RPC para seguir investigando.');
  if (code === 'INVALID_RANGE') return t(l, 'Enter an inclusive, non-negative block range: at most 720 blocks for RPC or 10,000 for Envio.', 'Introduce un rango inclusivo de bloques no negativos: máximo 720 para RPC o 10.000 para Envio.');
  if (code === 'FUTURE_RANGE') return t(l, 'This range is ahead of the RPC head. Choose past blocks.', 'Este rango está por delante del bloque actual del RPC. Elige bloques pasados.');
  if (code === 'WRONG_CHAIN') return t(l, 'The provider returned a different network. Evidence was rejected.', 'El proveedor devolvió otra red. Se rechazó la evidencia.');
  if (code === 'PROVIDER_TIMEOUT') return t(l, 'The provider took too long. Retry or choose a smaller range.', 'El proveedor tardó demasiado. Reintenta o elige un rango menor.');
  return t(l, 'The provider could not return valid evidence. Retry; the raw error code is available below.', 'El proveedor no pudo devolver evidencia válida. Reintenta; el código de error está debajo.');
};

export function KuruFlowIntelligence({ locale, view, onNavigate }: { locale: Locale; view: InvestigationView; onNavigate: (view: InvestigationView) => void }) {
  const [live, setLive] = useState<Investigation | null>(null);
  const [historical, setHistorical] = useState<Investigation | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [from, setFrom] = useState(String(HISTORICAL_EXAMPLE_BLOCK));
  const [to, setTo] = useState(String(HISTORICAL_EXAMPLE_BLOCK));
  const [provider, setProvider] = useState('rpc');
  const [source, setSource] = useState<'live' | 'historical'>('live');
  const [selected, setSelected] = useState('');
  const [side, setSide] = useState('ALL');
  const [search, setSearch] = useState('');
  const [pinned, setPinned] = useState<Investigation | null>(null);
  const [comparisonMode, setComparisonMode] = useState<'live' | 'windows'>('live');
  const controllers = useRef<{ live?: AbortController; historical?: AbortController }>({});
  const inspector = useRef<HTMLElement>(null);
  const load = useCallback(async (kind: 'live' | 'historical', url: string) => {
    controllers.current[kind]?.abort();
    const controller = new AbortController(); controllers.current[kind] = controller;
    const setResult = kind === 'live' ? setLive : setHistorical;
    const setLoading = kind === 'live' ? setLiveLoading : setHistoryLoading;
    setLoading(true); setSlow(false); setResult(null);
    const timer = setTimeout(() => { if (!controller.signal.aborted) setSlow(true); }, 4000);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
      const body = await response.json() as Investigation;
      if (!['LIVE', 'STALE', 'REPLAYED', 'UNAVAILABLE', 'CONFIG_REQUIRED'].includes(body.status) || !body.requestId) throw new Error('INVALID_RESPONSE');
      if (!response.ok && body.status !== 'UNAVAILABLE' && body.status !== 'CONFIG_REQUIRED') throw new Error('INVALID_RESPONSE');
      if (!controller.signal.aborted) { setResult(body); setSelected(''); }
    } catch (error) {
      if (!controller.signal.aborted) setResult({ status: 'UNAVAILABLE', mode: kind === 'live' ? 'LIVE' : 'HISTORICAL', provider: kind === 'live' || url.includes('kuru-history') ? 'Monad JSON-RPC' : 'Envio HyperSync', requestId: 'CLIENT_ERROR', observedAt: new Date().toISOString(), error: error instanceof Error && error.name === 'TimeoutError' ? 'PROVIDER_TIMEOUT' : 'CLIENT_ERROR', warnings: [] });
    } finally {
      clearTimeout(timer);
      if (!controller.signal.aborted) { setLoading(false); setSlow(false); }
    }
  }, []);
  useEffect(() => {
    if ((view !== 'live' && view !== 'explorer') || live || liveLoading) return;
    const timer = setTimeout(() => { void load('live', '/api/kuru-flow'); }, 0);
    return () => clearTimeout(timer);
  }, [view, live, liveLoading, load]);
  useEffect(() => {
    const requests = controllers.current;
    return () => { requests.live?.abort(); requests.historical?.abort(); };
  }, []);
  const runHistory = (first = from, last = to) => {
    setSource('historical'); setSearch(''); setSide('ALL');
    void load('historical', `/api/${provider === 'envio' ? 'kuru-replay' : 'kuru-history'}?fromBlock=${encodeURIComponent(first)}&toBlock=${encodeURIComponent(last)}`);
  };
  const activeSource = view === 'historical' ? 'historical' : view === 'live' ? 'live' : source;
  const data = activeSource === 'live' ? live : historical;
  const loading = activeSource === 'live' ? liveLoading : historyLoading;
  const trades = data?.trades ?? [];
  const filtered = trades.filter(trade => (side === 'ALL' || trade.side === side) && `${trade.transactionHash} ${trade.makerAddress} ${trade.takerAddress} ${trade.txOrigin} ${trade.blockNumber}`.toLowerCase().includes(search.trim().toLowerCase()));
  const trade = filtered.find(item => tradeKey(item) === selected) ?? filtered[0];
  const analysis = data?.analysis;
  const left = comparisonMode === 'live' ? live : pinned;
  const comparison = left && historical ? compareInvestigations(left, historical) : null;
  const inspect = (item: EvidenceTrade) => { setSelected(tradeKey(item)); if (window.innerWidth < 900) inspector.current?.scrollIntoView({ behavior: 'auto', block: 'start' }); inspector.current?.focus({ preventScroll: true }); };
  const exportEvidence = () => {
    if (!data?.window) return;
    const blob = new Blob([JSON.stringify({ product: 'Ghost Market: Monad Edition', ...data, selectedEvent: trade ? tradeKey(trade) : null, methodology: { event: 'Trade(uint40,address,bool,uint256,uint96,address,address,uint96)', priceScale: '1e18 USDC per MON', sizeScale: '1e10 MON', interpretation: 'Deterministic rules, not generative AI', finality: 'Not independently established' } }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = `ghost-kuru-${data.mode.toLowerCase()}-${data.window.firstBlock}-${data.window.lastBlock}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const resetFilters = () => { setSearch(''); setSide('ALL'); setSelected(''); };

  if (view === 'home') return <section className="page-shell research-home">
    <div className="research-home-hero"><div><p className="eyebrow">MONAD MARKETS · KURU MON/USDC</p><h1>{t(locale, 'Follow the trade. Verify the story.', 'Sigue la operación. Verifica la historia.')}</h1><p>{t(locale, 'Investigate executed order flow on Monad. Select an event, inspect its participants and verify its transaction on the explorer.', 'Investiga el flujo ejecutado en Monad. Selecciona un evento, inspecciona sus participantes y verifica su transacción en el explorador.')}</p><div className="research-actions"><button className="primary-action" onClick={() => onNavigate('live')}>{t(locale, 'Start live investigation', 'Investigar en vivo')} <ArrowRight /></button><button className="secondary-action" onClick={() => onNavigate('historical')}><History />{t(locale, 'Open historical replay', 'Abrir replay histórico')}</button></div></div><Image src="/ghost-companion.png" width={230} height={230} priority alt={t(locale, 'Ghost with a magnifying glass', 'Ghost con una lupa')} /></div>
    <div className="research-entry-grid">{([
      ['live', Activity, t(locale, 'Live Investigation', 'Investigación en vivo'), t(locale, 'Read the latest 720 blocks. Separate observed trades from rule-based interpretations.', 'Lee los últimos 720 bloques. Separa operaciones observadas de interpretaciones por reglas.')],
      ['historical', History, t(locale, 'Historical Replay', 'Replay histórico'), t(locale, 'Return to block 112682099 or query your own range. Compare two historical windows.', 'Vuelve al bloque 112682099 o consulta tu rango. Compara dos ventanas históricas.')],
      ['explorer', Search, t(locale, 'Evidence Explorer', 'Explorador de evidencia'), t(locale, 'Filter by side, block, hash or address. Inspect and export the underlying evidence.', 'Filtra por lado, bloque, hash o dirección. Inspecciona y exporta la evidencia subyacente.')],
    ] as const).map(([id, Icon, title, description]) => <button key={id} onClick={() => onNavigate(id)}><Icon /><h2>{title}</h2><p>{description}</p><span>{t(locale, 'Open workspace', 'Abrir espacio de trabajo')} <ArrowRight /></span></button>)}</div>
    <p className="research-source-note"><ShieldCheck />{t(locale, 'Real event queries · Monad chain ID 143 · Official Kuru market · Deterministic interpretation', 'Consultas de eventos reales · Monad chain ID 143 · Mercado oficial Kuru · Interpretación determinista')}</p>
  </section>;

  return <section className="page-shell research-workspace" aria-labelledby="research-title">
    <header className="research-heading"><div><p className="eyebrow">MONAD MARKETS · KURU FLOW FORENSICS</p><h1 id="research-title">{view === 'live' ? t(locale, 'Live Investigation', 'Investigación en vivo') : view === 'historical' ? t(locale, 'Historical Replay', 'Replay histórico') : t(locale, 'Evidence Explorer', 'Explorador de evidencia')}</h1><p>{t(locale, 'MON/USDC executed trades. Choose an event to inspect its evidence.', 'Operaciones ejecutadas MON/USDC. Elige un evento para inspeccionar su evidencia.')}</p></div>{view === 'live' && <button className="secondary-action" disabled={liveLoading} onClick={() => { resetFilters(); void load('live', '/api/kuru-flow'); }}><RefreshCw />{t(locale, 'Read latest window', 'Leer ventana reciente')}</button>}</header>
    {view === 'historical' && <div className="research-history-controls">
      <form onSubmit={event => { event.preventDefault(); runHistory(); }}><label>{t(locale, 'From block', 'Desde bloque')}<input required inputMode="numeric" pattern="[0-9]+" value={from} onChange={e => setFrom(e.target.value)} /></label><label>{t(locale, 'To block (inclusive)', 'Hasta bloque (inclusivo)')}<input required inputMode="numeric" pattern="[0-9]+" value={to} onChange={e => setTo(e.target.value)} /></label><label>{t(locale, 'Evidence provider', 'Proveedor de evidencia')}<select value={provider} onChange={e => setProvider(e.target.value)}><option value="rpc">Monad RPC · ≤720 {t(locale, 'blocks', 'bloques')}</option><option value="envio">Envio HyperSync · ≤10,000</option></select></label><button className="primary-action" disabled={historyLoading}><History />{t(locale, 'Query history', 'Consultar historial')}</button></form>
      <div className="research-preset"><button className="secondary-action" disabled={historyLoading} onClick={() => { const block = String(HISTORICAL_EXAMPLE_BLOCK); setFrom(block); setTo(block); runHistory(block, block); }}>{t(locale, 'Investigate block 112682099', 'Investigar bloque 112682099')}</button><span>{t(locale, 'Real historical investigation · queried on demand', 'Investigación histórica real · consulta bajo demanda')}</span>{live?.window && <button className="secondary-action" disabled={historyLoading} onClick={() => { setFrom(String(live.window!.firstBlock)); setTo(String(live.window!.lastBlock)); runHistory(String(live.window!.firstBlock), String(live.window!.lastBlock)); }}>{t(locale, 'Replay captured live range', 'Reproducir rango capturado en vivo')}</button>}</div>
    </div>}
    {view === 'explorer' && <div className="research-source-switch"><button aria-pressed={source === 'live'} onClick={() => { setSource('live'); resetFilters(); }}>LIVE</button><button aria-pressed={source === 'historical'} onClick={() => { setSource('historical'); resetFilters(); }}>{t(locale, 'HISTORICAL', 'HISTÓRICO')}</button>{!historical && source === 'historical' && <button onClick={() => onNavigate('historical')}>{t(locale, 'Query a historical window', 'Consultar una ventana histórica')} <ArrowRight /></button>}</div>}
    <div className="research-status" aria-live="polite"><span className={`status-badge status-${loading ? 'loading' : data?.status.toLowerCase() ?? 'unavailable'}`}><i />{loading ? t(locale, 'LOADING', 'CARGANDO') : data?.status ?? t(locale, 'NOT QUERIED', 'SIN CONSULTAR')}</span><span>{data?.provider ?? (activeSource === 'live' ? 'Monad JSON-RPC' : t(locale, 'Choose a provider above', 'Elige un proveedor arriba'))}</span>{data?.window && <span>#{n(data.window.firstBlock, locale, 0)} → #{n(data.window.lastBlock, locale, 0)} · {n(data.window.blockCount, locale, 0)} {t(locale, 'blocks', 'bloques')}</span>}{data && <small>{t(locale, 'Captured', 'Capturado')}: {new Date(data.observedAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-BO')}</small>}</div>
    {loading && <div className="research-state" role="status"><Activity /><p>{slow ? t(locale, 'The provider is still responding. This request stops after 30 seconds.', 'El proveedor aún está respondiendo. Esta consulta se detiene tras 30 segundos.') : t(locale, 'Reading event evidence…', 'Leyendo evidencia de eventos…')}</p></div>}
    {!loading && data?.error && <div className="research-state research-error" role="alert"><p>{errorCopy(data.error, locale)}</p><code>{data.error}</code><button className="secondary-action" onClick={() => activeSource === 'live' ? void load('live', '/api/kuru-flow') : runHistory()}>{t(locale, 'Retry', 'Reintentar')}</button></div>}
    {!loading && !data && <div className="research-state"><History /><p>{t(locale, 'Query a block range to load its actual events. This page works independently of live data.', 'Consulta un rango de bloques para cargar sus eventos reales. Esta página funciona independientemente de los datos en vivo.')}</p></div>}
    {data?.window && analysis && !loading && <>
      {data.status === 'STALE' && <p className="research-warning">{t(locale, 'The RPC returned an old head. This captured window is stale; refresh before treating it as recent.', 'El RPC devolvió un bloque antiguo. Esta ventana capturada está desactualizada; actualiza antes de tratarla como reciente.')}</p>}
      <div className="kuru-metrics"><article><span>{t(locale, 'OBSERVED EVENTS', 'EVENTOS OBSERVADOS')}</span><strong>{analysis.tradeCount}</strong><p>{analysis.buyCount} {t(locale, 'buys', 'compras')} · {analysis.sellCount} {t(locale, 'sells', 'ventas')}</p></article><article><span>{t(locale, 'EXECUTED VOLUME', 'VOLUMEN EJECUTADO')}</span><strong>{n(analysis.totalVolumeMon, locale)} MON</strong><p>{n(analysis.totalNotionalUsd, locale, 2)} USDC {t(locale, 'notional', 'nocional')}</p></article><article><span>VWAP · {t(locale, 'DERIVED', 'DERIVADO')}</span><strong>{price(analysis.vwapUsd, locale)}</strong><p>{t(locale, 'Volume-weighted price', 'Precio ponderado por volumen')}</p></article><article><span>{t(locale, 'AGGRESSOR IMBALANCE', 'DESEQUILIBRIO AGRESOR')}</span><strong>{n(analysis.imbalancePercent, locale, 1)}%</strong><p>{t(locale, 'Derived by MON volume', 'Derivado por volumen MON')}</p></article><article><span>{t(locale, 'SAMPLE COVERAGE', 'COBERTURA DE MUESTRA')}</span><strong>{data.window.returnedTradeCount} / {data.window.decodedTradeCount}</strong><p>{t(locale, 'returned / decoded events', 'eventos devueltos / decodificados')}</p></article></div>
      {data.window.capped && <p className="research-warning">{t(locale, 'Sample capped at the newest 60 events. Metrics describe this sample; window comparison is withheld.', 'Muestra limitada a los 60 eventos más recientes. Las métricas describen esta muestra; se omite la comparación de ventanas.')}</p>}
      <div className="research-evidence-layout"><article className="research-tape"><header><h2>{t(locale, 'Choose an operation', 'Elige una operación')}</h2><span>{filtered.length} / {trades.length}</span></header><div className="research-filters"><label><span>{t(locale, 'Side', 'Lado')}</span><select value={side} onChange={e => setSide(e.target.value)}><option value="ALL">{t(locale, 'All', 'Todos')}</option><option value="BUY">{t(locale, 'Buy', 'Compra')}</option><option value="SELL">{t(locale, 'Sell', 'Venta')}</option></select></label><label><span>{t(locale, 'Hash, address or block', 'Hash, dirección o bloque')}</span><input type="search" placeholder={t(locale, 'Search evidence', 'Buscar evidencia')} value={search} onChange={e => setSearch(e.target.value)} /></label></div>
        <p className="research-filter-note">{t(locale, 'Filters affect this list; metrics describe the full returned sample.', 'Los filtros afectan esta lista; las métricas describen toda la muestra devuelta.')}</p>
        {filtered.length ? <div className="research-trade-list">{filtered.map(item => <button key={tradeKey(item)} aria-pressed={trade && tradeKey(trade) === tradeKey(item)} onClick={() => inspect(item)}><span className={`trade-side ${item.side.toLowerCase()}`}>{item.side === 'BUY' ? t(locale, 'BUY', 'COMPRA') : t(locale, 'SELL', 'VENTA')}</span><strong>{n(item.sizeMon, locale)} MON</strong><span>{price(item.priceUsd, locale)}</span><code>#{item.blockNumber} · log {item.logIndex}</code></button>)}</div> : <div className="research-state"><p>{trades.length ? t(locale, 'No matching events. Clear the filters to return to the evidence.', 'Sin eventos coincidentes. Limpia los filtros para volver a la evidencia.') : t(locale, 'No Trade events in this verified range. An empty window is a valid result; it does not imply an inactive network.', 'Sin eventos Trade en este rango verificado. Una ventana vacía es un resultado válido; no implica una red inactiva.')}</p>{trades.length > 0 && <button className="secondary-action" onClick={resetFilters}>{t(locale, 'Clear filters', 'Limpiar filtros')}</button>}</div>}
      </article><aside ref={inspector} tabIndex={-1} className="research-inspector" aria-label={t(locale, 'Selected operation evidence', 'Evidencia de la operación seleccionada')}>
        <header><Fingerprint /><h2>{t(locale, 'Event evidence', 'Evidencia del evento')}</h2><span>{t(locale, 'OBSERVED', 'OBSERVADO')}</span></header>
        {trade ? <TradeEvidence trade={trade} locale={locale} provider={data.provider} /> : <p>{t(locale, 'Select a matching event to inspect its block, participants and raw evidence.', 'Selecciona un evento coincidente para inspeccionar su bloque, participantes y evidencia cruda.')}</p>}
      </aside></div>
      <Interpretation data={data} locale={locale} onSelect={item => { resetFilters(); setSelected(tradeKey(item)); inspector.current?.focus({ preventScroll: true }); inspector.current?.scrollIntoView({ block: 'nearest' }); }} />
      <div className="research-proof-actions"><button className="secondary-action" onClick={exportEvidence}><Download />{t(locale, 'Export evidence JSON', 'Exportar evidencia JSON')}</button><button className="secondary-action" onClick={() => { setSource(activeSource); onNavigate('explorer'); }}><Search />{t(locale, 'Open Evidence Explorer', 'Abrir explorador de evidencia')}</button><a href={`https://monadscan.com/address/${KURU_MON_USDC_MARKET}`} target="_blank" rel="noreferrer">{t(locale, 'Market contract', 'Contrato del mercado')} <ExternalLink /></a><a href="https://docs.kuru.io/contracts/Contract-addresses" target="_blank" rel="noreferrer">{t(locale, 'Official Kuru addresses', 'Direcciones oficiales Kuru')} <ExternalLink /></a></div>
      <details className="technical-disclosure"><summary>{t(locale, 'Source, methodology and limits', 'Fuente, metodología y límites')}</summary><p>{data.provider} · {t(locale, 'request', 'consulta')} {data.requestId}</p><p>{t(locale, 'Price is USDC per MON, decoded with 1e18 precision; size uses 1e10. USDC is not assumed to equal USD. BUY/SELL is aggressor side from the official Trade ABI, not a user instruction.', 'El precio es USDC por MON, decodificado con precisión 1e18; el tamaño usa 1e10. No se asume que USDC equivale a USD. COMPRA/VENTA es el lado agresor del ABI Trade oficial, no una instrucción al usuario.')}</p><a href="https://github.com/Kuru-Labs/Kuru-contracts-dex-public/blob/2060bb2736080c175d80d568bfdb6226bb5abd04/contracts/interfaces/IOrderBook.sol" target="_blank" rel="noreferrer">{t(locale, 'Pinned official ABI', 'ABI oficial fijado')}</a><p>{t(locale, 'Hashes and decoded fields are provider evidence. Finality and canonical chain membership are not independently established by this app.', 'Los hashes y campos decodificados son evidencia del proveedor. La aplicación no establece de forma independiente finalidad ni pertenencia a la cadena canónica.')}</p></details>
    </>}
    {view === 'historical' && <article className="research-comparison" aria-labelledby="comparison-title">
      <header><div><p className="eyebrow">{t(locale, 'CAPTURED WINDOW COMPARISON', 'COMPARACIÓN DE VENTANAS CAPTURADAS')}</p><h2 id="comparison-title">{t(locale, 'Compare evidence windows', 'Comparar ventanas de evidencia')}</h2></div><div className="research-source-switch"><button aria-pressed={comparisonMode === 'live'} onClick={() => setComparisonMode('live')}>LIVE ↔ {t(locale, 'HISTORICAL', 'HISTÓRICO')}</button><button aria-pressed={comparisonMode === 'windows'} onClick={() => setComparisonMode('windows')}>{t(locale, 'Historical A ↔ B', 'Histórica A ↔ B')}</button></div></header>
      <p>{t(locale, 'Keep a baseline as A, then query B. Volume is normalized per block; price and imbalance changes describe B relative to A.', 'Guarda una referencia como A y después consulta B. El volumen se normaliza por bloque; los cambios de precio y desequilibrio describen B respecto a A.')}</p>
      <div className="research-actions">{comparisonMode === 'live' ? <button className="secondary-action" disabled={liveLoading} onClick={() => void load('live', '/api/kuru-flow')}><RefreshCw />{t(locale, 'Capture LIVE baseline A', 'Capturar referencia LIVE A')}</button> : <button className="secondary-action" disabled={!historical?.analysis || historyLoading} onClick={() => setPinned(historical)}>{t(locale, 'Keep current history as A', 'Guardar histórico actual como A')}</button>}</div>
      <div className="comparison-windows"><ComparisonWindow label="A" data={left} locale={locale} loading={comparisonMode === 'live' && liveLoading} baseline /><ComparisonWindow label="B" data={historical} locale={locale} loading={historyLoading} /></div>
      {comparison ? <div className="research-comparison-grid">
        <div><h3>{t(locale, 'Executed events', 'Eventos ejecutados')}</h3><dl className="comparison-values"><div><dt>A</dt><dd>{n(comparison.leftCount, locale, 0)}</dd></div><div><dt>B</dt><dd>{n(comparison.rightCount, locale, 0)}</dd></div></dl></div>
        <div><h3>{t(locale, 'MON per block', 'MON por bloque')}</h3><dl className="comparison-values"><div><dt>A</dt><dd>{n(comparison.leftVolumePerBlock, locale)}</dd></div><div><dt>B</dt><dd>{n(comparison.rightVolumePerBlock, locale)}</dd></div></dl><small>{t(locale, 'Normalized by each range length', 'Normalizado por longitud de cada rango')}</small></div>
        <div><h3>{t(locale, 'VWAP change', 'Cambio de VWAP')}</h3><span className="comparison-delta-label">B {t(locale, 'relative to A', 'respecto a A')}</span><strong>{comparison.vwapDeltaPercent == null ? t(locale, 'Insufficient trades', 'Operaciones insuficientes') : signed(comparison.vwapDeltaPercent, locale, '%')}</strong><small>{t(locale, 'Executed price in USDC per MON', 'Precio ejecutado en USDC por MON')}</small></div>
        <div><h3>{t(locale, 'Imbalance change', 'Cambio de desequilibrio')}</h3><span className="comparison-delta-label">B − A</span><strong>{comparison.imbalanceDeltaPoints == null ? t(locale, 'Insufficient trades', 'Operaciones insuficientes') : signed(comparison.imbalanceDeltaPoints, locale, ' '+t(locale, 'pp', 'pp'))}</strong><small>{t(locale, 'Percentage points, not percent change', 'Puntos porcentuales, no cambio porcentual')}</small></div>
      </div> : <p className="comparison-empty">{left?.window?.capped || historical?.window?.capped ? t(locale, 'A sample is capped. Comparison is withheld to avoid mixing full and partial windows.', 'Una muestra está recortada. Se omite la comparación para evitar mezclar ventanas completas y parciales.') : t(locale, 'Capture A and query B to compare two complete windows. Empty windows keep zero volume; price and imbalance changes remain unavailable.', 'Captura A y consulta B para comparar dos ventanas completas. Las ventanas vacías conservan volumen cero; los cambios de precio y desequilibrio quedan sin valor.')}</p>}
      <p className="research-filter-note">{t(locale, 'Dates and ranges may differ. This comparison does not establish provider agreement, future price direction or market safety.', 'Las fechas y rangos pueden diferir. Esta comparación no establece acuerdo entre proveedores, dirección futura de precio ni seguridad del mercado.')}</p>
    </article>}
    {view === 'live' && <MonadNetworkPulse locale={locale} />}
  </section>;
}

function TradeEvidence({ trade, locale, provider }: { trade: EvidenceTrade; locale: Locale; provider: string }) {
  const links = evidenceLinks(trade);
  return <><p className="research-event-summary">{trade.side === 'BUY' ? t(locale, 'Aggressive buy', 'Compra agresiva') : t(locale, 'Aggressive sell', 'Venta agresiva')} · {n(trade.sizeMon, locale)} MON @ {price(trade.priceUsd, locale)}</p><dl><div><dt>{t(locale, 'Block / event index', 'Bloque / índice de evento')}</dt><dd><a href={links.block} target="_blank" rel="noreferrer">#{trade.blockNumber} <ExternalLink /></a> · log {trade.logIndex}</dd></div><div><dt>{t(locale, 'Transaction hash', 'Hash de transacción')}</dt><dd><a href={links.transaction} target="_blank" rel="noreferrer">{trade.transactionHash} <ExternalLink /></a></dd></div>{trade.blockHash && <div><dt>{t(locale, 'Block hash', 'Hash de bloque')}</dt><dd><code>{trade.blockHash}</code></dd></div>}{[['Maker', trade.makerAddress], ['Taker', trade.takerAddress], ['txOrigin', trade.txOrigin]].map(([label, address]) => <div key={label}><dt>{label}</dt><dd><a href={`https://monadvision.com/address/${address}`} target="_blank" rel="noreferrer">{address} <ExternalLink /></a></dd></div>)}<div><dt>{t(locale, 'Order ID / remaining size', 'ID de orden / tamaño restante')}</dt><dd>{trade.orderId} / {n(trade.orderRemainingMon, locale)} MON</dd></div><div><dt>{t(locale, 'Calculated notional', 'Nocional calculado')}</dt><dd>{n(trade.notionalUsd, locale)} USDC</dd></div></dl><p>{t(locale, 'The Trade event records an executed fill. Maker, taker and txOrigin are emitted addresses; they do not identify people or beneficial owners.', 'El evento Trade registra una ejecución. Maker, taker y txOrigin son direcciones emitidas; no identifican personas ni propietarios beneficiarios.')}</p><small>{provider}</small>{trade.rawData && <details><summary>{t(locale, 'Raw event data', 'Datos crudos del evento')}</summary><code>{trade.rawData}</code>{trade.rawTopics?.map(topic => <code key={topic}>{topic}</code>)}</details>}</>;
}

function Interpretation({ data, locale, onSelect }: { data: Investigation; locale: Locale; onSelect: (trade: EvidenceTrade) => void }) {
  const a = data.analysis!;
  const trades = data.trades ?? [];
  const largest = [...trades].sort((x, y) => y.sizeMon - x.sizeMon)[0];
  const min = [...trades].sort((x, y) => x.priceUsd - y.priceUsd)[0];
  const max = [...trades].sort((x, y) => y.priceUsd - x.priceUsd)[0];
  const ref = (item: EvidenceTrade | undefined, label: string) => item ? <button onClick={() => onSelect(item)}>{label} · #{item.blockNumber} / log {item.logIndex} <ArrowRight /></button> : null;
  return <article className="research-interpretation"><header><ShieldCheck /><div><span>{t(locale, 'DETERMINISTIC INTERPRETATION · INFERENCE', 'INTERPRETACIÓN DETERMINISTA · INFERENCIA')}</span><h2>{t(locale, 'What does this evidence support?', '¿Qué respalda esta evidencia?')}</h2></div></header><p>{locale === 'en' ? a.explanation : a.explanationEs}</p><div className="research-rule-grid"><section><h3>{t(locale, 'Sample strength', 'Solidez de muestra')}</h3><p>{a.tradeCount} {t(locale, 'events; fewer than 5 withholds direction.', 'eventos; con menos de 5 se omite dirección.')}</p></section><section><h3>{t(locale, 'Aggressor balance', 'Balance agresor')}</h3><p>{n(a.imbalancePercent, locale, 1)}% · {t(locale, 'direction band ±25%; review at |70%| with ≥5 events.', 'banda direccional ±25%; revisión en |70%| con ≥5 eventos.')}</p>{ref(trades.find(item => item.side === (a.imbalancePercent >= 0 ? 'BUY' : 'SELL')), t(locale, 'Inspect contributing event', 'Inspeccionar evento contribuyente'))}</section><section><h3>{t(locale, 'Largest fill', 'Mayor ejecución')}</h3><p>{n(a.largestTradeSharePercent, locale, 1)}% · {t(locale, 'review at ≥50% of volume with ≥3 events.', 'revisión en ≥50% del volumen con ≥3 eventos.')}</p>{ref(largest, t(locale, 'Inspect largest event', 'Inspeccionar mayor evento'))}</section><section><h3>{t(locale, 'Executed price range', 'Rango de precio ejecutado')}</h3><p>{n(a.priceRangeBps, locale, 1)} bps · {t(locale, 'review at ≥200 bps with ≥5 events.', 'revisión en ≥200 pb con ≥5 eventos.')}</p>{ref(min, t(locale, 'Low print', 'Ejecución menor'))}{max && max !== min && ref(max, t(locale, 'High print', 'Ejecución mayor'))}</section></div>{a.flags.map(flag => <p key={flag.code} className="research-warning">{locale === 'en' ? flag.explanation : flag.explanationEs}</p>)}<p className="research-filter-note">{t(locale, 'These rules describe the disclosed sample. They do not establish intent, manipulation, safety or future returns. No generative AI provider is used.', 'Estas reglas describen la muestra declarada. No establecen intención, manipulación, seguridad ni retornos futuros. No se usa un proveedor de IA generativa.')}</p></article>;
}

function ComparisonWindow({ label, data, locale, loading, baseline = false }: { label: 'A' | 'B'; data: Investigation | null; locale: Locale; loading: boolean; baseline?: boolean }) {
  return <section className="comparison-window" aria-label={t(locale, 'Window ', 'Ventana ')+label}>
    <header><span className="comparison-letter">{label}</span><h3>{baseline ? t(locale, 'Captured baseline', 'Referencia capturada') : t(locale, 'Current historical result', 'Resultado histórico actual')}</h3><span className="comparison-window-state">{loading ? t(locale, 'Loading', 'Cargando') : data?.window ? data.mode === 'LIVE' ? t(locale, 'Live snapshot', 'Captura en vivo') : t(locale, 'Historical', 'Histórico') : t(locale, 'Pending', 'Pendiente')}</span></header>
    {data?.window ? <><p className="comparison-provider">{data.provider}</p><dl><div><dt>{t(locale, 'Block range', 'Rango de bloques')}</dt><dd>#{n(data.window.firstBlock, locale, 0)} → #{n(data.window.lastBlock, locale, 0)}</dd></div><div><dt>{t(locale, 'Captured at', 'Capturada el')}</dt><dd>{new Date(data.observedAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-BO', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div><div><dt>{t(locale, 'Coverage', 'Cobertura')}</dt><dd>{n(data.window.blockCount, locale, 0)} {t(locale, 'blocks', 'bloques')} · {data.window.returnedTradeCount}/{data.window.decodedTradeCount} {t(locale, 'events', 'eventos')}{data.window.capped ? ' · '+t(locale, 'capped', 'recortada') : ''}</dd></div></dl></> : <p className="comparison-window-prompt">{baseline ? t(locale, 'Capture LIVE or keep a historical result as your baseline.', 'Captura LIVE o guarda un resultado histórico como referencia.') : t(locale, 'Use the historical form above to query window B.', 'Usa el formulario histórico de arriba para consultar la ventana B.')}</p>}
  </section>;
}
