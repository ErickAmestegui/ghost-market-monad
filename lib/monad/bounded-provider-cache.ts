// Per-isolate bounds; these are not a global rate limiter across Worker instances.
export function createBoundedProviderCache<T>({ ttlMs, maxEntries, maxConcurrent, clock = Date.now }: {
    ttlMs: number;
    maxEntries: number;
    maxConcurrent: number;
    clock?: () => number;
}) {
    const values = new Map<string, {
        at: number;
        value: T;
    }>();
    const pending = new Map<string, Promise<T>>();
    return async function read(key: string, loader: () => Promise<T>): Promise<T> {
        const cached = values.get(key);
        if (cached && clock() >= cached.at && clock() - cached.at < ttlMs)
            return cached.value;
        values.delete(key);
        const existing = pending.get(key);
        if (existing)
            return existing;
        if (pending.size >= maxConcurrent)
            throw new Error('PROVIDER_BUSY');
        const task = Promise.resolve().then(loader).then(value => {
            if (values.size >= maxEntries)
                values.delete(values.keys().next().value!);
            values.set(key, { at: clock(), value });
            return value;
        }).finally(() => pending.delete(key));
        pending.set(key, task);
        return task;
    };
}
