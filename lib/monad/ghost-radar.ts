import { analyzeKuruFlow, KURU_MAX_TRADES, KURU_MON_USDC_MARKET } from './kuru-flow.ts';
import { tradeKey, type EvidenceTrade, type Investigation } from './kuru-investigation.ts';
export const RADAR_DEFAULT_RULES = { minimumTrades: 5, concentrationPercent: 50, imbalancePercent: 70, repeatedEvents: 2, activityMultiple: 2 };
export type RadarRules = typeof RADAR_DEFAULT_RULES;
export type RadarFinding = {
    code: 'CONCENTRATION' | 'IMBALANCE' | 'REPEATED_ADDRESS' | 'ACTIVITY_CLUSTER' | 'EXECUTED_FLOW' | 'QUIET' | 'PARTIAL';
    value: number;
    threshold: number;
    eventKeys: string[];
    address?: string;
};
export type GhostCase = {
    id: string;
    evidence: Investigation;
    findings: RadarFinding[];
    interest: number;
    category: 'ACTIVE' | 'QUIET';
    coverage: { status: 'FULL_RETURNED' | 'CAPPED'; returnedEvents: number; decodedEvents: number };
    sample: { status: 'EMPTY' | 'SPARSE' | 'RULE_MINIMUM_MET'; count: number; ruleMinimum: number };
    rank: number;
    rules: RadarRules;
};
export type RadarResult = {
    status: 'SCANNED' | 'UNAVAILABLE' | 'CONFIG_REQUIRED';
    provider: string;
    requestId: string;
    observedAt: string;
    scope?: {
        firstBlock: number;
        lastBlock: number;
        blockCount: number;
        windowCount: number;
        decodedEvents: number;
    };
    cases: GhostCase[];
    rules: RadarRules;
    error?: string;
};
export function validateRadarRules(input: Partial<RadarRules>): RadarRules {
    const result = { ...RADAR_DEFAULT_RULES, ...input };
    const bounds: Record<keyof RadarRules, [
        number,
        number
    ]> = { minimumTrades: [3, 20], concentrationPercent: [30, 100], imbalancePercent: [25, 100], repeatedEvents: [2, 10], activityMultiple: [2, 10] };
    for (const key of Object.keys(bounds) as Array<keyof RadarRules>)
        if (!Number.isSafeInteger(result[key]) || result[key] < bounds[key][0] || result[key] > bounds[key][1])
            throw new Error('INVALID_RULES');
    return result;
}
export function createRadarCases(snapshot: Investigation, windowCount = 6, rulesInput: Partial<RadarRules> = {}): RadarResult {
    const rules = validateRadarRules(rulesInput);
    if (!snapshot.window || !snapshot.trades || !snapshot.analysis || snapshot.window.capped || !['LIVE', 'STALE', 'REPLAYED'].includes(snapshot.status))
        throw new Error('INCOMPLETE_RADAR_SCAN');
    const scope = snapshot.window;
    const scanTrades = snapshot.trades;
    if (scope.blockCount !== scope.lastBlock - scope.firstBlock + 1 || scope.decodedTradeCount !== scanTrades.length || scope.returnedTradeCount !== scanTrades.length) throw new Error('INCOMPLETE_RADAR_SCAN');
    if (!Number.isSafeInteger(windowCount) || windowCount < 1 || windowCount > 8 || windowCount > scope.blockCount)
        throw new Error('INVALID_WINDOW_COUNT');
    const keys = new Set<string>();
    for (const trade of snapshot.trades) {
        if (keys.has(tradeKey(trade)) || trade.blockNumber < scope.firstBlock || trade.blockNumber > scope.lastBlock)
            throw new Error('INVALID_RADAR_EVIDENCE');
        keys.add(tradeKey(trade));
    }
    const cases: GhostCase[] = Array.from({ length: windowCount }, (_, index) => {
        const firstBlock = scope.firstBlock + Math.floor(index * scope.blockCount / windowCount);
        const lastBlock = scope.firstBlock + Math.floor((index + 1) * scope.blockCount / windowCount) - 1;
        const all = scanTrades.filter(trade => trade.blockNumber >= firstBlock && trade.blockNumber <= lastBlock).sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
        const trades = all.slice(-KURU_MAX_TRADES).reverse();
        const analysis = analyzeKuruFlow(trades);
        const capped = all.length > trades.length;
        const sampleStatus = !trades.length ? 'EMPTY' : trades.length < rules.minimumTrades ? 'SPARSE' : 'RULE_MINIMUM_MET';
        const evidence: Investigation = { status: 'REPLAYED', provider: snapshot.provider, requestId: `${snapshot.requestId}:${firstBlock}`, observedAt: snapshot.observedAt, mode: 'HISTORICAL', window: { firstBlock, lastBlock, blockCount: lastBlock - firstBlock + 1, decodedTradeCount: all.length, returnedTradeCount: trades.length, capped }, trades, analysis, warnings: ['Reconstructed from a bounded provider scan. No finality or human identity claim.'] };
        const findings: RadarFinding[] = [];
        const largest = [...trades].sort((a, b) => b.sizeMon - a.sizeMon)[0];
        if (capped)
            findings.push({ code: 'PARTIAL', value: trades.length, threshold: all.length, eventKeys: [] });
        else {
            if (trades.length >= 3 && analysis.largestTradeSharePercent! >= rules.concentrationPercent)
                findings.push({ code: 'CONCENTRATION', value: analysis.largestTradeSharePercent!, threshold: rules.concentrationPercent, eventKeys: largest ? [tradeKey(largest)] : [] });
            if (trades.length >= rules.minimumTrades && Math.abs(analysis.imbalancePercent) >= rules.imbalancePercent)
                findings.push({ code: 'IMBALANCE', value: analysis.imbalancePercent, threshold: rules.imbalancePercent, eventKeys: trades.filter(t => t.side === (analysis.imbalancePercent > 0 ? 'BUY' : 'SELL')).map(tradeKey) });
            const participants = new Map<string, string[]>();
            for (const trade of trades)
                for (const address of new Set([trade.makerAddress, trade.takerAddress])) {
                    const events = participants.get(address) ?? [];
                    events.push(tradeKey(trade));
                    participants.set(address, events);
                }
            const repeated = [...participants].filter(([, events]) => events.length >= rules.repeatedEvents).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
            if (repeated[0])
                findings.push({ code: 'REPEATED_ADDRESS', value: repeated[0][1].length, threshold: rules.repeatedEvents, address: repeated[0][0], eventKeys: repeated[0][1] });
            if (!trades.length)
                findings.push({ code: 'QUIET', value: 0, threshold: 0, eventKeys: [] });
            if (!findings.length)
                findings.push({ code: 'EXECUTED_FLOW', value: trades.length, threshold: rules.minimumTrades, eventKeys: largest ? [tradeKey(largest)] : [] });
        }
        return { id: `kuru-mon-usdc:${firstBlock}-${lastBlock}`, evidence, findings, interest: 0, category: trades.length ? 'ACTIVE' : 'QUIET', coverage: {status: capped ? 'CAPPED' : 'FULL_RETURNED', returnedEvents: trades.length, decodedEvents: all.length}, sample: {status: sampleStatus, count: trades.length, ruleMinimum: rules.minimumTrades}, rank: 0, rules };
    });
    for (const item of cases) {
        const count = item.evidence.analysis!.tradeCount;
        const otherCounts = cases.filter(c => c !== item && !c.evidence.window!.capped).map(c => c.evidence.analysis!.tradeCount / c.evidence.window!.blockCount);
        const mean = otherCounts.length ? otherCounts.reduce((a, b) => a + b, 0) / otherCounts.length : 0;
        const density = count / item.evidence.window!.blockCount;
        if (item.coverage.status === 'FULL_RETURNED' && item.sample.status === 'RULE_MINIMUM_MET' && otherCounts.length && mean > 0 && density >= mean * rules.activityMultiple && count >= rules.minimumTrades)
            item.findings.push({ code: 'ACTIVITY_CLUSTER', value: density / mean, threshold: rules.activityMultiple, eventKeys: item.evidence.trades!.map(tradeKey) });
        const weights: Record<RadarFinding['code'], number> = { CONCENTRATION: 30, IMBALANCE: 25, REPEATED_ADDRESS: 20, ACTIVITY_CLUSTER: 25, EXECUTED_FLOW: 10, QUIET: 0, PARTIAL: 0 };
        const interest = item.findings.reduce((sum, f) => sum + weights[f.code], 0) + Math.min(15, count);
        item.interest = Math.min(item.coverage.status === 'CAPPED' ? 15 : item.sample.status !== 'RULE_MINIMUM_MET' ? 35 : 100, interest);
    }
    cases.sort((a, b) => b.interest - a.interest || b.sample.count - a.sample.count || b.evidence.window!.lastBlock - a.evidence.window!.lastBlock);
    cases.forEach((c, i) => c.rank = i + 1);
    return { status: 'SCANNED', provider: snapshot.provider, requestId: snapshot.requestId, observedAt: snapshot.observedAt, scope: { firstBlock: scope.firstBlock, lastBlock: scope.lastBlock, blockCount: scope.blockCount, windowCount, decodedEvents: snapshot.window.decodedTradeCount }, cases, rules };
}
export function caseSearchParams(item: GhostCase) {
    const w = item.evidence.window!;
    return new URLSearchParams({ view: 'historical', market: 'kuru-mon-usdc', fromBlock: String(w.firstBlock), toBlock: String(w.lastBlock), provider: item.evidence.provider === 'Envio HyperSync' ? 'envio' : 'rpc' }).toString();
}
export function readCaseParams(query: URLSearchParams) {
    if (query.get('view') !== 'historical' || query.get('market') !== 'kuru-mon-usdc')
        return null;
    const from = query.get('fromBlock') ?? '', to = query.get('toBlock') ?? '', provider = query.get('provider') ?? 'rpc';
    const max = provider === 'envio' ? 10000 : 720;
    if (!['rpc', 'envio'].includes(provider) || !/^\d+$/.test(from) || !/^\d+$/.test(to) || !Number.isSafeInteger(Number(to) + 1) || Number(to) < Number(from) || Number(to) - Number(from) + 1 > max)
        throw new Error('INVALID_CASE_LINK');
    return { fromBlock: Number(from), toBlock: Number(to), provider, market: KURU_MON_USDC_MARKET };
}
export function findingContributors(item: GhostCase, finding: RadarFinding): EvidenceTrade[] { return item.evidence.trades!.filter(trade => finding.eventKeys.includes(tradeKey(trade))); }

export function radarBarHeight(count: number, maxCount: number) { return count > 0 && maxCount > 0 ? count / maxCount * 50 : 0; }
