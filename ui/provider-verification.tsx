"use client";
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@/data/types';
import type { compareProviderEvents } from '@/lib/monad/provider-agreement';
type ResponseData = {
    status: string;
    error?: string;
    requestId?: string;
    result?: ReturnType<typeof compareProviderEvents>;
};
const t = (l: Locale, en: string, es: string) => l === 'en' ? en : es;
export function ProviderVerification({ locale, firstBlock, lastBlock }: {
    locale: Locale;
    firstBlock: string;
    lastBlock: string;
}) {
    const [data, setData] = useState<ResponseData | null>(null);
    const [loading, setLoading] = useState(false);
    const request = useRef<AbortController | null>(null);
    useEffect(() => () => request.current?.abort(), []);
    async function verify() {
        request.current?.abort();
        const abort = new AbortController();
        request.current = abort;
        setLoading(true);
        setData(null);
        try {
            const query = new URLSearchParams({ fromBlock: firstBlock, toBlock: lastBlock });
            const response = await fetch('/api/kuru-provider-compare?' + query, { cache: 'no-store', signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]) });
            const body = await response.json() as ResponseData;
            if (!['COMPARED', 'CONFIG_REQUIRED', 'UNAVAILABLE'].includes(body.status))
                throw new Error('INVALID_RESPONSE');
            if (!abort.signal.aborted)
                setData(body);
        }
        catch {
            if (!abort.signal.aborted)
                setData({ status: 'UNAVAILABLE', error: 'CLIENT_OR_TIMEOUT' });
        }
        finally {
            if (!abort.signal.aborted)
                setLoading(false);
        }
    }
    return <details className="technical-disclosure provider-verification">
    <summary>{t(locale, 'Verify one window across RPC and Envio', 'Verificar una ventana con RPC y Envio')}</summary>
    <p>#{firstBlock} → #{lastBlock} · {t(locale, 'Same market, range and event indices; maximum 720 blocks. Requires a server Envio token.', 'Mismo mercado, rango e índices de eventos; máximo 720 bloques. Requiere un token Envio del servidor.')}</p>
    <button className="secondary-action" disabled={loading} onClick={() => void verify()}>{loading ? t(locale, 'Comparing providers…', 'Comparando proveedores…') : t(locale, 'Compare RPC ↔ Envio', 'Comparar RPC ↔ Envio')}</button>
    {data && <div role="status"><strong>{data.status === 'COMPARED' ? data.result?.agreement ? t(locale, 'PROVIDER AGREEMENT', 'ACUERDO ENTRE PROVEEDORES') : t(locale, 'PROVIDER DISAGREEMENT', 'DESACUERDO ENTRE PROVEEDORES') : data.status}</strong>
      {data.status === 'CONFIG_REQUIRED' && <p>{t(locale, 'No token is configured. No authenticated Envio result or agreement is claimed.', 'No hay token configurado. No se afirma un resultado autenticado de Envio ni acuerdo.')}</p>}
      {data.result && <><p>RPC: {data.result.rpcCount} · Envio: {data.result.envioCount}</p><p>{t(locale, 'RPC only / Envio only / field mismatches', 'Solo RPC / solo Envio / discrepancias de campos')}: {data.result.onlyRpc.length} / {data.result.onlyEnvio.length} / {data.result.mismatches.length}</p><details><summary>{t(locale, 'Compared event fields and differences', 'Campos comparados y diferencias')}</summary><code>{JSON.stringify(data.result, null, 2)}</code></details></>}
      <code>{data.error ?? data.requestId}</code></div>}
    <p>{t(locale, 'Agreement does not independently prove chain finality. This is separate from A/B window comparison.', 'El acuerdo no prueba de forma independiente la finalidad de la cadena. Esta función es distinta de la comparación A/B de ventanas.')}</p>
  </details>;
}
