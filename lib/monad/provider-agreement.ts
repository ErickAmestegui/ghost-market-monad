import { tradeKey, type EvidenceTrade } from './kuru-investigation.ts';
export function compareProviderEvents(rpc: EvidenceTrade[], envio: EvidenceTrade[]) {
    const left = new Map(rpc.map(t => [tradeKey(t), t])), right = new Map(envio.map(t => [tradeKey(t), t]));
    if (left.size !== rpc.length || right.size !== envio.length)
        throw new Error('DUPLICATE_PROVIDER_EVIDENCE');
    const onlyRpc = [...left.keys()].filter(k => !right.has(k)), onlyEnvio = [...right.keys()].filter(k => !left.has(k));
    const mismatches: string[] = [];
    const fields = ['blockNumber', 'blockHash', 'priceUsd', 'sizeMon', 'side', 'makerAddress', 'takerAddress', 'txOrigin', 'orderId', 'orderRemainingMon', 'rawData'] as const;
    for (const [key, t] of left) {
        const other = right.get(key);
        if (other && fields.some(f => t[f] !== other[f]))
            mismatches.push(key);
    }
    return { agreement: !onlyRpc.length && !onlyEnvio.length && !mismatches.length, rpcCount: rpc.length, envioCount: envio.length, onlyRpc, onlyEnvio, mismatches, comparedFields: fields };
}
