// Build-time merge of other modules' blocks and observers into a host component's own code (@container, @block,
// @event, @observer in etc/components/*.graphqls). The same file ships in both build kits.

const CONTAINER_IMPORT =
    /^[ \t]*import\s+Container\s+from\s+['"]OOCS_LynxTheme\/Components\/Container(?:\.vue)?['"];?[ \t]*\r?\n?/m
const DISPATCH_IMPORT =
    /^[ \t]*import\s*\{\s*dispatch\s*\}\s*from\s*['"]OOCS_LynxTheme\/utils\/dispatch['"];?[ \t]*\r?\n?/m

/**
 * The code with each Container tag (`name="x"`) replaced by the blocks declared for x (none: removed) and each
 * `dispatch('e', …)` by a call running e's observers; null when the file imports neither.
 *
 * @param {string} code
 * @param {{
 *   kind: 'vue' | 'ts',
 *   containers: Record<string, { blocks: { name: string, template: string }[] }>,
 *   blockId: (template: string) => string,
 *   eventId: (name: string) => string,
 * }} options
 * @returns {string | null}
 */
export function expandExtensions(code, { kind, containers, blockId, eventId }) {
    const usesContainer = kind !== 'ts' && CONTAINER_IMPORT.test(code)
    const usesDispatch = DISPATCH_IMPORT.test(code)
    if (!usesContainer && !usesDispatch) return null

    const imports = []
    let out = code

    if (usesContainer) {
        out = out.replace(CONTAINER_IMPORT, '').replace(/<Container\b([^>]*?)\/\s*>/g, (tag, attrs) => {
            const name = attrs.match(/(?:^|\s)name="([^"]+)"/)
            if (!name) throw new Error(`<Container> needs its name written out: ${tag}`)
            const rest = attrs.replace(name[0], '').trim()
            const blocks = (containers[name[1]]?.blocks ?? []).map(block => {
                const local = `LynxBlock${imports.length}`
                imports.push(`import ${local} from ${JSON.stringify(blockId(block.template))}`)
                return `<${local}${rest ? ` ${rest}` : ''} />`
            })
            return blocks.join('')
        })
        if (/<Container\b/.test(out)) throw new Error('<Container> must be self-closing')
    }

    if (usesDispatch) {
        out = out
            .replace(DISPATCH_IMPORT, '')
            .replace(/\bdispatch\(\s*(['"])([^'"]+)\1\s*,?\s*/g, (_call, _q, name) => {
                const local = `LynxEvent${imports.length}`
                imports.push(`import ${local} from ${JSON.stringify(eventId(name))}`)
                return `${local}(`
            })
        if (/\bdispatch\(/.test(out))
            throw new Error("dispatch() needs its event name written out: dispatch('…', data)")
    }

    const lines = imports.join('\n')
    if (kind !== 'vue') return `${lines}\n${out}`

    const setup = out.match(/<script\b[^>]*\bsetup\b[^>]*>/)
    if (!setup) throw new Error('<Container> and dispatch() need <script setup>')
    return out.replace(setup[0], `${setup[0]}\n${lines}`)
}
