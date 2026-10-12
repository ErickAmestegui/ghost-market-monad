"use client";
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, ExternalLink, Radar, RefreshCw, Share2 } from 'lucide-react';
import type { Locale } from '@/data/types';
import { RADAR_DEFAULT_RULES, radarBarHeight, caseSearchParams, findingContributors, type GhostCase, type RadarFinding, type RadarResult } from '@/lib/monad/ghost-radar';
import { evidenceLinks, type Investigation } from '@/lib/monad/kuru-investigation';
const t = (l: Locale, en: string, es: string) => l === 'en' ? en : es;
const n = (v: number, l: Locale) => v.toLocaleString(l === 'en' ? 'en-US' : 'es-BO', { maximumFractionDigits: 2 });
const labels: Record<RadarFinding['code'], [
    string,
    string
]> = { CONCENTRATION: ['Volume concentration', 'Concentración de volumen'], IMBALANCE: ['Aggressor imbalance', 'Desequilibrio agresor'], REPEATED_ADDRESS: ['Repeated participant address', 'Dirección participante repetida'], ACTIVITY_CLUSTER: ['Activity concentration', 'Concentración de actividad'], EXECUTED_FLOW: ['Executed market flow', 'Flujo de mercado ejecutado'], QUIET: ['Verified quiet interval', 'Intervalo sin eventos verificado'], PARTIAL: ['Partial evidence view', 'Vista de evidencia parcial'] };
export function Finding({ finding, locale }: {
    finding: RadarFinding;
    locale: Locale;
}) {
    const [en, es] = labels[finding.code];
    return <><strong>{t(locale, en, es)}</strong><p>{finding.code === 'CONCENTRATION' ? t(locale, `Largest fill: ${n(finding.value, locale)}% of MON volume; threshold ≥${finding.threshold}% with ≥3 events.`, `Mayor ejecución: ${n(finding.value, locale)}% del volumen MON; umbral ≥${finding.threshold}% con ≥3 eventos.`) : finding.code === 'IMBALANCE' ? t(locale, `Net aggressor imbalance: ${n(finding.value, locale)}%; absolute threshold ≥${finding.threshold}%.`, `Desequilibrio agresor neto: ${n(finding.value, locale)}%; umbral absoluto ≥${finding.threshold}%.`) : finding.code === 'REPEATED_ADDRESS' ? t(locale, `${finding.value} distinct events share an emitted maker/taker address (threshold ${finding.threshold}). This does not establish a person's identity.`, `${finding.value} eventos distintos comparten una dirección maker/taker emitida (umbral ${finding.threshold}). Esto no establece identidad personal.`) : finding.code === 'QUIET' ? t(locale, 'No Trade events were returned for this fully scanned interval. Other contracts and markets were not evaluated.', 'No se devolvieron eventos Trade para este intervalo completamente consultado. No se evaluaron otros contratos ni mercados.') : finding.code === 'PARTIAL' ? t(locale, `${finding.value}/${finding.threshold} events displayed. Pattern ranking is withheld for this truncated sample.`, `${finding.value}/${finding.threshold} eventos mostrados. Se omite el ranking de patrones para esta muestra recortada.`) : finding.code === 'ACTIVITY_CLUSTER' ? t(locale, `Activity exceeds the other scanned windows by the disclosed ${finding.threshold}× gate, with the minimum sample met.`, `La actividad supera las otras ventanas consultadas según el umbral declarado ${finding.threshold}× y cumple la muestra mínima.`) : t(locale, `${finding.value} executed events. This is an evidence candidate, not a directional claim.`, `${finding.value} eventos ejecutados. Es un candidato de evidencia, no una afirmación direccional.`)}</p>{finding.address && <code>{finding.address}</code>}</>;
}
export function GhostRadar({ locale, data, onData, onOpen, onInvestigate }: {
    locale: Locale;
    data: RadarResult | null;
    onData: (data: RadarResult) => void;
    onOpen: (caseData: Investigation, baseline?: Investigation) => void;
    onInvestigate?: (item: GhostCase) => void;
}) {
    const [loading, setLoading] = useState(false), [slow, setSlow] = useState(false), [selected, setSelected] = useState(''), [notice, setNotice] = useState('');
    const [end, setEnd] = useState(''), [provider, setProvider] = useState('rpc'), [rules, setRules] = useState(data?.rules ?? RADAR_DEFAULT_RULES);
    const request = useRef<AbortController | null>(null);
    const run = async () => {
        request.current?.abort();
        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        setSlow(false);
        setNotice('');
        const timer = setTimeout(() => setSlow(true), 4000);
        try {
            const query = new URLSearchParams({ provider, ...Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, String(v)])) });
            if (end.trim())
                query.set('toBlock', end.trim());
            const response = await fetch('/api/ghost-radar?' + query, { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
            const body = await response.json() as RadarResult;
            if (!['SCANNED', 'UNAVAILABLE', 'CONFIG_REQUIRED'].includes(body.status) || !Array.isArray(body.cases))
                throw new Error('INVALID_RESPONSE');
            if (!controller.signal.aborted) {
                onData(body);
                setSelected(body.cases[0]?.id ?? '');
            }
        }
        catch {
            if (!controller.signal.aborted)
                onData({ status: 'UNAVAILABLE', provider: provider === 'rpc' ? 'Monad JSON-RPC' : 'Envio HyperSync', requestId: 'CLIENT_ERROR', observedAt: new Date().toISOString(), cases: [], rules, error: 'CLIENT_OR_TIMEOUT' });
        }
        finally {
            clearTimeout(timer);
            if (!controller.signal.aborted) {
                setLoading(false);
                setSlow(false);
            }
        }
    };
    // Automatically scan only when the user explicitly opens Radar, never on the overview.
    const start = useRef(run);
    useEffect(() => { const timer = !data ? setTimeout(() => { void start.current(); }, 0) : null; return () => { if (timer)
        clearTimeout(timer); request.current?.abort(); }; }, [data]);
    const activeCases = data?.cases.filter(c => c.category === 'ACTIVE') ?? [];
    const quietCases = data?.cases.filter(c => c.category === 'QUIET') ?? [];
    const maxEvents = Math.max(0, ...(data?.cases.map(c => c.sample.count) ?? []));
    const item = data?.cases.find(c => c.id === selected) ?? data?.cases[0];
    const share = async (c: GhostCase) => { const url = new URL(window.location.origin + window.location.pathname); url.search = caseSearchParams(c); try {
        await navigator.clipboard.writeText(url.toString());
        setNotice(t(locale, 'Reproducible investigation link copied. Opening it queries the provider again.', 'Enlace reproducible copiado. Al abrirlo se vuelve a consultar el proveedor.'));
    }
    catch {
        setNotice(url.toString());
    } };
    const exportCase = (c: GhostCase) => { const blob = new Blob([JSON.stringify({ schema: 'ghost-case/v2', ...c, reproduce: caseSearchParams(c), evidenceClass: 'PROVIDER_EVENT_EVIDENCE', interpretationClass: 'DETERMINISTIC_RULES', unknown: ['Human identity', 'Intent', 'Finality', 'Other market activity'] }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `ghost-case-${c.evidence.window!.firstBlock}-${c.evidence.window!.lastBlock}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    return <section className="page-shell radar-page"><header className="research-heading"><div><p className="eyebrow">GHOST RADAR · KURU MON/USDC · MONAD 143</p><h1>{t(locale, 'Find the evidence worth investigating.', 'Encuentra evidencia que merece investigarse.')}</h1><p>{t(locale, 'Ghost scans a bounded block horizon and ranks cases by analytical interest and evidence quality. No statistical confidence or profit forecasts.', 'Ghost explora un horizonte acotado de bloques y ordena casos por interés analítico y calidad de evidencia. Sin confianza estadística calculada ni pronósticos de rentabilidad.')}</p></div><Radar aria-hidden="true"/></header>
 <form className="radar-controls" onSubmit={e => { e.preventDefault(); void run(); }}><label>{t(locale, 'Evidence provider', 'Proveedor de evidencia')}<select value={provider} onChange={e => setProvider(e.target.value)}><option value="rpc">Monad RPC · 720 {t(locale, 'blocks', 'bloques')}</option><option value="envio">Envio HyperSync · 10,000</option></select></label><label>{t(locale, 'End block (empty = latest RPC)', 'Bloque final (vacío = RPC reciente)')}<input inputMode="numeric" pattern="[0-9]+" value={end} onChange={e => setEnd(e.target.value)} required={provider === 'envio'} placeholder={t(locale, 'Discover from latest blocks', 'Descubrir desde bloques recientes')}/></label><button className="primary-action" disabled={loading}><Radar />{t(locale, 'Find an Investigation', 'Encontrar una investigación')}</button></form>
 <details className="technical-disclosure radar-rules"><summary>{t(locale, 'Configure transparent rules', 'Configurar reglas transparentes')}</summary><div className="radar-rule-inputs">{([['minimumTrades', 'Minimum directional sample', 'Muestra mínima direccional', 3, 20], ['concentrationPercent', 'Largest fill ≥ %', 'Mayor ejecución ≥ %', 30, 100], ['imbalancePercent', 'Absolute imbalance ≥ %', 'Desequilibrio absoluto ≥ %', 25, 100], ['repeatedEvents', 'Repeated-address events ≥', 'Eventos con dirección repetida ≥', 2, 10], ['activityMultiple', 'Activity density ≥ × other mean', 'Densidad de actividad ≥ × media restante', 2, 10]] as const).map(([key, en, es, min, max]) => <label key={key}>{t(locale, en, es)}<input type="number" min={min} max={max} value={rules[key]} onChange={e => setRules({ ...rules, [key]: Number(e.target.value) })}/></label>)}</div><p>{t(locale, 'Scores are fixed review heuristics: concentration 30, imbalance 25, repeated address 20, activity 25, ordinary flow 10, plus up to 15 event-count points. Sparse scores cap at 35; partial samples withhold pattern findings. Returned-event coverage and sample size are separate. Meeting a rule minimum is not statistical confidence or certainty about this market. Change rules then scan again.', 'Los puntajes son heurísticas fijas de revisión: concentración 30, desequilibrio 25, dirección repetida 20, actividad 25, flujo ordinario 10, más hasta 15 puntos por cantidad de eventos. Las muestras escasas se limitan a 35; las parciales omiten hallazgos de patrones. La cobertura de eventos devueltos y el tamaño de muestra son independientes. Cumplir el mínimo de una regla no es confianza estadística ni certeza sobre este mercado. Cambia las reglas y consulta de nuevo.')}</p></details>
 {loading && <div className="research-state" role="status"><RefreshCw /><p>{slow ? t(locale, 'Still scanning real provider logs. Deadline: 30 seconds.', 'Aún se consultan logs reales del proveedor. Límite: 30 segundos.') : t(locale, 'Looking for real investigations…', 'Buscando investigaciones reales…')}</p></div>}
 {!loading && data?.status !== 'SCANNED' && data && <div className="research-state research-error" role="alert"><p>{data.status === 'CONFIG_REQUIRED' ? t(locale, 'Envio needs a server token. Select Monad RPC to investigate now.', 'Envio necesita un token del servidor. Selecciona Monad RPC para investigar ahora.') : t(locale, 'The scan did not return complete valid evidence. No simulated cases were substituted. Retry or reduce the horizon.', 'La exploración no devolvió evidencia completa válida. No se sustituyeron casos simulados. Reintenta o reduce el horizonte.')}</p><code>{data.error}</code></div>}
 {data?.status === 'SCANNED' && data.scope && !loading && <><div className="research-status"><span className="status-badge status-replayed">{t(locale, 'SCAN COMPLETE', 'EXPLORACIÓN COMPLETA')}</span><span>{data.provider} · #{data.scope.firstBlock} → #{data.scope.lastBlock}</span><span>{data.scope.decodedEvents} {t(locale, 'decoded events', 'eventos decodificados')} · {data.scope.windowCount} {t(locale, 'windows', 'ventanas')}</span><small>{new Date(data.observedAt).toLocaleString(locale === 'en' ? 'en-US' : 'es-BO')}</small></div><p className="research-filter-note">{t(locale, 'Only this market and horizon were scanned. Empty intervals and sparse samples are retained. This is not an exhaustive historical search.', 'Solo se consultaron este mercado y horizonte. Se conservan intervalos vacíos y muestras escasas. No es una búsqueda histórica exhaustiva.')}</p>
 <div className="radar-timeline" aria-label={t(locale, 'Real block window timeline', 'Línea de tiempo de ventanas reales')}>{[...data.cases].sort((a, b) => a.evidence.window!.firstBlock - b.evidence.window!.firstBlock).map(c => <button key={c.id} aria-pressed={c.id === item?.id} onClick={() => setSelected(c.id)}><span>{c.evidence.analysis!.tradeCount} {t(locale, 'events', 'eventos')}</span><div className="radar-bar-track"><i aria-hidden="true" style={{ height: `${radarBarHeight(c.sample.count, maxEvents)}px` }}/></div><code>#{c.evidence.window!.firstBlock}</code></button>)}</div>
 <div className="radar-layout"><article className="ghost-cases"><header><h2>Ghost Cases</h2><span>{activeCases.length} {t(locale,'active','con eventos')}</span></header>{!activeCases.length&&<p className="research-filter-note">{t(locale,'No events in this scan. Quiet intervals remain available below; this is not a safety claim.','Sin eventos en esta consulta. Los intervalos vacíos están disponibles abajo; esto no indica seguridad.')}</p>}{activeCases.map(c=><CaseButton key={c.id} item={c} selected={item?.id} locale={locale} onSelect={setSelected}/>)}{quietCases.length>0&&<details className="radar-quiet"><summary>{t(locale,'Intervals without events','Intervalos sin eventos')} · {quietCases.length}</summary><p>{t(locale,'Secondary coverage evidence; no statistical or directional conclusion.','Evidencia secundaria de cobertura; sin conclusión estadística ni direccional.')}</p>{quietCases.map(c=><CaseButton key={c.id} item={c} selected={item?.id} locale={locale} onSelect={setSelected}/>)}</details>}</article>
 {item && <article className="radar-case-details" aria-label={t(locale, 'Selected Ghost Case', 'Caso Ghost seleccionado')}><header><span className="eyebrow">{t(locale, 'EVIDENCE → DERIVATION → INTERPRETATION', 'EVIDENCIA → DERIVACIÓN → INTERPRETACIÓN')}</span><h2>#{item.evidence.window!.firstBlock} → #{item.evidence.window!.lastBlock}</h2></header><div className="radar-case-facts"><span>{t(locale, 'Observed', 'Observado')}: {item.evidence.analysis!.tradeCount} Trade {t(locale, 'events', 'eventos')}</span><span>{t(locale, 'Derived volume', 'Volumen derivado')}: {n(item.evidence.analysis!.totalVolumeMon, locale)} MON</span><span>{t(locale,'Returned evidence','Evidencia devuelta')}: {item.coverage.returnedEvents}/{item.coverage.decodedEvents} · {item.coverage.status==='CAPPED'?t(locale,'capped','recortada'):t(locale,'no display truncation','sin recorte de visualización')}</span><span>{t(locale,'Sample','Muestra')}: n={item.sample.count} · {t(locale,'directional rule minimum','mínimo de regla direccional')} {item.sample.ruleMinimum}</span></div>
 {item.findings.map(f => <section className="case-finding" key={f.code}><Finding finding={f} locale={locale}/><div className="case-contributors">{findingContributors(item, f).slice(0, 4).map(trade => <a key={trade.transactionHash + trade.logIndex} href={evidenceLinks(trade).transaction} target="_blank" rel="noreferrer">#{trade.blockNumber} · log {trade.logIndex} · {n(trade.sizeMon, locale)} MON <ExternalLink /></a>)}</div></section>)}
 <p className="research-warning">{t(locale, 'Unknown: intent, human identity, finality and activity outside this horizon. Pattern selection is a review prompt, not fraud detection or trading advice.', 'Desconocido: intención, identidad humana, finalidad y actividad fuera del horizonte. La selección es una invitación a revisar, no detección de fraude ni consejo de trading.')}</p><div className="research-actions">{onInvestigate && <button className="primary-action" onClick={() => onInvestigate(item)}>{t(locale, "Investigate MON Across Markets", "Investiga MON entre mercados")}<ArrowRight /></button>}<button className="secondary-action" onClick={() => onOpen(item.evidence)}>{t(locale, 'Inspect this case', 'Inspeccionar este caso')}<ArrowRight /></button><button className="secondary-action" onClick={() => onOpen(item.evidence, data.cases.find(c => c.id !== item.id && c.evidence.window && !c.evidence.window.capped)?.evidence)}>{t(locale, 'Compare with another window', 'Comparar con otra ventana')}</button><button className="secondary-action" onClick={() => void share(item)}><Share2 />{t(locale, 'Copy case link', 'Copiar enlace del caso')}</button><button className="secondary-action" onClick={() => exportCase(item)}><Download />{t(locale, 'Export Ghost Case', 'Exportar caso Ghost')}</button></div><p className="research-filter-note">{t(locale, 'Source', 'Fuente')}: {item.evidence.provider} · {item.evidence.requestId}</p></article>}</div></>}
 {notice && <p className="research-state" role="status">{notice}</p>}
 </section>;
}

function CaseButton({item:c,selected,locale,onSelect}:{item:GhostCase;selected?:string;locale:Locale;onSelect:(id:string)=>void}) { return <button className="ghost-case-button" aria-pressed={c.id===selected} onClick={()=>onSelect(c.id)}><span className="case-rank">{c.category==='ACTIVE'?'#'+c.rank:'—'}</span><div><strong>{t(locale,...labels[c.findings[0].code])}</strong><small>#{c.evidence.window!.firstBlock} → #{c.evidence.window!.lastBlock}</small><span>{c.sample.count} {t(locale,'events','eventos')} · {c.interest} {t(locale,'priority points','puntos de prioridad')}</span></div><span className="case-quality">{c.coverage.status==='CAPPED'?t(locale,'Capped','Recortada'):c.sample.status==='RULE_MINIMUM_MET'?t(locale,'Rule minimum met','Mínimo de regla cumplido'):c.sample.status==='SPARSE'?t(locale,'Small sample','Muestra pequeña'):t(locale,'No events','Sin eventos')}</span></button>; }
