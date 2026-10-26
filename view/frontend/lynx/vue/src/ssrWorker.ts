import { renderEnvelope, type Envelope } from 'OOCS_LynxTheme/ssrRender'

// The Cloudflare Worker renderer, answering like Inertia's Node server: POST /render → { head, body }, GET /health,
// anything else → 200 NOT_FOUND. Nothing authenticates the public URL (use Cloudflare Access or WAF); Workers Paid.

const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', Server: 'Lynx SSR (Cloudflare Worker)' },
    })

export default {
    async fetch(request: Request): Promise<Response> {
        const { pathname } = new URL(request.url)

        if (pathname === '/health') {
            return json({ status: 'OK', timestamp: Date.now() })
        }

        if (pathname !== '/render') {
            return json({ status: 'NOT_FOUND', timestamp: Date.now() })
        }

        if (request.method !== 'POST') {
            return json({ error: 'POST the page object to /render' }, 405)
        }

        let envelope: Envelope
        try {
            envelope = (await request.json()) as Envelope
        } catch {
            return json({ error: 'Body is not JSON' }, 400)
        }

        try {
            return json(await renderEnvelope(envelope))
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e))
            // The shape Inertia's server reports a failed render in; the PHP side logs it.
            const component = typeof envelope.component === 'string' ? envelope.component : ''
            console.error(`SSR Error [${component}]: ${error.message}`)
            return json(
                {
                    error: error.message,
                    component: envelope.component ?? null,
                    url: envelope.url ?? null,
                    stack: error.stack,
                    timestamp: new Date().toISOString(),
                },
                500
            )
        }
    },
}
