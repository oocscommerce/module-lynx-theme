/**
 * Typing only: the build replaces each dispatch('event', data) with a call running that event's observers (@observer),
 * which may change `data`, or throw to stop the caller
 */
export function dispatch<K extends keyof Lynx.Events>(name: K, data: Lynx.Events[K]): Promise<void> {
    void name
    void data
    return Promise.resolve()
}
