import createServer from '@inertiajs/vue3/server'
import { renderEnvelope, type Envelope } from 'OOCS_LynxTheme/ssrRender'

// The Node renderer: Inertia's HTTP server (/render, /health, /shutdown) around OOCS_LynxTheme/ssrRender.ts.
// Run with `npm run ssr` (--enable-source-maps names the .vue file on a failed render); keep the port private.
export function startSsrServer(): void {
    createServer(
        // Inertia types the callback argument as its Page; the envelope carries more.
        envelope => renderEnvelope(envelope as unknown as Envelope),
        {
            port: Number(process.env.LYNX_SSR_PORT ?? 13714),
            // Every interface, for PHP in another container; LYNX_SSR_HOST=127.0.0.1 keeps the port local.
            host: process.env.LYNX_SSR_HOST ?? '0.0.0.0',
            cluster: process.env.LYNX_SSR_CLUSTER === '1',
        }
    )
}
