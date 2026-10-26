import { existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { resolve, relative, dirname, normalize, sep } from 'path'
import { gzipSync } from 'zlib'
import { createHash } from 'crypto'
import { expandExtensions } from './extensions.js'

/**
 * The `lynx` section of the theme's meta-package (.lynx/package.json), written by `bin/magento lynx:theme:setup`: the
 * enabled modules and the parent themes, paths relative to the build root. Missing is fatal, not an empty build.
 *
 * @param {string} lynxDir The theme's build root
 */
export function readManifest(lynxDir) {
    const manifest = resolve(lynxDir, '.lynx/package.json')
    if (!existsSync(manifest)) {
        throw new Error(`[lynx] no ${manifest}. Run \`bin/magento lynx:theme:setup <theme>\` to write it.`)
    }

    return JSON.parse(readFileSync(manifest, 'utf8'))
}

/**
 * The enabled modules with vue sources, as absolute dirs keyed by module name
 *
 * @param {string} lynxDir
 * @returns {Record<string, string>}
 */
export function readModuleDirs(lynxDir) {
    const modules = readManifest(lynxDir).lynx?.modules ?? {}

    return Object.fromEntries(Object.entries(modules).map(([name, path]) => [name, resolve(lynxDir, path)]))
}

/**
 * The themes this one inherits from, nearest first (a parent from a package sits under vendor/, so the chain cannot
 * be guessed from disk)
 *
 * @param {string} lynxDir
 * @returns {string[]}
 */
export function readParentThemeDirs(lynxDir) {
    return (readManifest(lynxDir).lynx?.parents ?? []).map(dir => resolve(lynxDir, dir))
}

/**
 * The npm packages of the build root, its own and the meta-package's: resolved from its node_modules for every
 * importer, the kit and the modules' sources under vendor/ included
 *
 * @param {string} lynxDir
 * @returns {string[]}
 */
export function readDependencyNames(lynxDir) {
    const own = JSON.parse(readFileSync(resolve(lynxDir, 'package.json'), 'utf8'))
    const packages = [readManifest(lynxDir), own].flatMap(json => [
        ...Object.keys(json.dependencies ?? {}),
        ...Object.keys(json.devDependencies ?? {}),
    ])

    return [...new Set(packages)]
}

/**
 * The view/frontend/lynx/vue/src of every enabled module, keyed by module name. One fixed dir per framework,
 * so a theme override sits at the matching path.
 *
 * @param {string} lynxDir
 */
export function discoverModuleVueSrcDirs(lynxDir) {
    const result = []

    for (const [prefix, dir] of Object.entries(readModuleDirs(lynxDir))) {
        const src = resolve(dir, 'view/frontend/lynx/vue/src')
        if (existsSync(src)) {
            result.push({ dir: src, prefix })
        }
    }

    return result
}

/**
 * The theme's module overrides, <themeDir>/Vendor_Module/lynx/vue/src, same prefix as the module they replace.
 * Overrides of a module outside `enabled` are dropped: nothing of it is in the build.
 *
 * @param {string} themeDir
 * @param {Set<string>} [enabled]
 */
export function discoverThemeOverrideDirs(themeDir, enabled) {
    const result = []
    if (!existsSync(themeDir)) return result
    for (const entry of readdirSync(themeDir)) {
        // Match Magento Vendor_Module convention
        if (!/^[A-Z][A-Za-z0-9]+_[A-Z][A-Za-z0-9]+$/.test(entry)) continue
        if (enabled && !enabled.has(entry)) continue
        const vueSrc = resolve(themeDir, entry, 'lynx/vue/src')
        if (existsSync(vueSrc)) {
            result.push({ dir: vueSrc, prefix: entry })
        }
    }
    return result
}

/**
 * The source dirs of each parent theme, nearest first: its flat src/ and its module overrides, below the building
 * theme and above the modules. A directory that is not there is skipped.
 *
 * @param {string[]} parentThemeDirs theme roots, e.g. [.../OOCS/LynxBlank]
 * @param {Set<string>} [enabled] module prefixes still in the build, as above
 */
export function discoverParentThemeDirs(parentThemeDirs, enabled) {
    const result = []
    for (const themeDir of parentThemeDirs) {
        if (!existsSync(themeDir)) continue

        const flatSrc = resolve(themeDir, 'lynx/src')
        if (existsSync(flatSrc)) {
            result.push({ dir: flatSrc, prefix: '' })
        }
        result.push(...discoverThemeOverrideDirs(themeDir, enabled))
    }
    return result
}

/**
 * Magento-like theme fallback for Vite: srcDirs in priority order (index 0 highest), prefix '' for the theme's
 * flat src, 'OOCS_Module' for namespaced dirs. Every .vue is mapped, and every .ts of the prefixed dirs (stores,
 * utils, types), file for file. Serves virtual:lynx-pages and virtual:lynx-components.
 */
export function vueThemeFallback(srcDirs) {
    const dirs = srcDirs.map(({ dir, prefix }) => ({ dir: resolve(dir), prefix })).filter(({ dir }) => existsSync(dir))

    // Build map: key (e.g. "OOCS_LynxInertia/Pages/About.vue") → absolute path of winner
    function buildFileMap() {
        const map = new Map()
        // Reverse: lowest priority first, higher priority overwrites
        for (const { dir, prefix } of [...dirs].reverse()) {
            for (const logical of scanVueFiles(dir, prefix !== '')) {
                const key = prefix ? `${prefix}/${logical}` : logical
                map.set(key, resolve(dir, logical))
            }
        }
        return map
    }

    let fileMap = buildFileMap()

    /** Filled by generateBundle, printed by closeBundle. */
    let builtFrom = []
    let sizes = null
    let startedAt = 0
    // lynx:static:deploy -v
    const verbose = Boolean(process.env.LYNX_BUILD_VERBOSE)

    const VIRTUAL_PAGES = 'virtual:lynx-pages'
    const VIRTUAL_COMPONENTS = 'virtual:lynx-components'
    const EVENT_PREFIX = 'virtual:lynx-event:'
    // A block's or an observer's copy for one host (path beside the real file) → the real file
    const blockCopies = new Map()

    // Written by lynx:static:deploy beside the theme's src
    const extensionsFile = resolve(srcDirs[0].dir, '..', 'dist', 'extensions.json')
    let isTest = false

    // None in tests: a host's tests pick up no module's blocks
    const readExtensions = () =>
        !isTest && existsSync(extensionsFile) ? JSON.parse(readFileSync(extensionsFile, 'utf8')) : {}
    let extensions = {}

    return {
        name: 'vue-theme-fallback',
        enforce: 'pre',

        // One alias per module with a view/frontend/lynx/css directory (`@import "OOCS_Module/css/x.css"`):
        // the CSS pipeline does not go through resolveId, so CSS is not overridden file for file.

        config() {
            const alias = []
            const seen = new Set()
            for (const { dir, prefix } of dirs) {
                if (!prefix || seen.has(prefix)) continue
                const cssDir = resolve(dir, '..', '..', 'css')
                if (!existsSync(cssDir)) continue
                seen.add(prefix)
                alias.push({ find: new RegExp(`^${prefix}/css/`), replacement: cssDir + sep })
            }
            return alias.length ? { resolve: { alias } } : {}
        },

        configResolved(config) {
            isTest = config.mode === 'test'
        },

        // Warn on a declared container or event the host's winning file does not use
        buildStart() {
            startedAt = Date.now()
            extensions = readExtensions()
            const { containers = {}, events = {} } = extensions
            const quoted = name => `['"]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`
            const checks = [
                ...Object.entries(containers).map(([name, { host }]) => [
                    host,
                    `container ${name}`,
                    `name=\\{?${quoted(name)}`,
                ]),
                ...Object.entries(events).map(([name, { host }]) => [
                    host,
                    `event ${name}`,
                    `dispatch\\(\\s*${quoted(name)}`,
                ]),
            ]
            for (const [host, what, pattern] of checks) {
                const file = host && fileMap.get(host + '.vue')
                if (file && !new RegExp(pattern).test(readFileSync(file, 'utf8'))) {
                    const from = file.replace(/\\/g, '/').replace(/^.*?\/(app|vendor|packages)\//, '$1/')
                    this.warn(`${what} is declared on ${host}, but ${from} does not use it`)
                }
            }
        },

        configureServer(server) {
            server.watcher.add(extensionsFile)
            server.watcher.on('change', file => {
                if (resolve(file) !== extensionsFile) return
                extensions = readExtensions()
                server.moduleGraph.invalidateAll()
                server.ws.send({ type: 'full-reload' })
            })

            const onChange = file => {
                if (/\.(vue|ts)$/.test(file) && dirs.some(({ dir }) => file.startsWith(dir))) {
                    fileMap = buildFileMap()
                    for (const id of [VIRTUAL_PAGES, VIRTUAL_COMPONENTS]) {
                        const m = server.moduleGraph.getModuleById('\0' + id)
                        if (m) server.moduleGraph.invalidateModule(m)
                    }
                }
            }
            server.watcher.on('add', onChange)
            server.watcher.on('unlink', onChange)
        },

        async resolveId(id, importer) {
            // Virtual modules
            if (id === VIRTUAL_PAGES) return '\0' + VIRTUAL_PAGES
            if (id === VIRTUAL_COMPONENTS) return '\0' + VIRTUAL_COMPONENTS
            if (id.startsWith(EVENT_PREFIX)) return '\0' + id
            if (blockCopies.has(id)) return id

            // Module-namespaced import, with the extension ('…/Section.vue') or without as TS imports are written.
            if (!id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0')) {
                for (const candidate of [id, id + '.vue', id + '.ts']) {
                    if (fileMap.has(candidate)) return fileMap.get(candidate)
                }
            }

            // Bare npm imports from module src dirs resolve from the theme: its build root holds the only node_modules
            if (!id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0') && importer) {
                if (dirs.slice(1).some(({ dir }) => importer.startsWith(dir + sep))) {
                    return this.resolve(id, resolve(dirs[0].dir, '_virtual.js'), { skipSelf: true })
                }
            }

            // Relative imports inside a module ('./Step/Address.vue') still get the file that won theme fallback.
            if (!importer) return null

            let absPath
            if (id.startsWith('/')) {
                absPath = normalize(id)
            } else if (id.startsWith('.')) {
                absPath = resolve(dirname(importer), id)
            } else {
                return null
            }

            // .vue is written with its extension, .ts without; anything else stays with the default resolver.
            if (!absPath.endsWith('.vue')) {
                if (/\.[^/\\]+$/.test(absPath)) return null
                absPath += '.ts'
            }

            const owner = dirs.find(({ dir }) => absPath.startsWith(dir + sep) || absPath.startsWith(dir + '/'))
            if (!owner) return null

            const logical = relative(owner.dir, absPath).replace(/\\/g, '/')
            const key = owner.prefix ? `${owner.prefix}/${logical}` : logical
            const topFile = fileMap.get(key)

            if (!topFile || normalize(topFile) === normalize(absPath)) return null
            return topFile
        },

        load(id) {
            if (blockCopies.has(id)) return readFileSync(blockCopies.get(id), 'utf8')

            // One event's observers in order for one host, each through a copy of its own so it lands in that host's
            // chunk; imported through fallback so a theme may override them
            if (id.startsWith('\0' + EVENT_PREFIX)) {
                const [host, name] = id.slice(EVENT_PREFIX.length + 1).split('/')
                const observers = (extensions.events?.[name]?.observers ?? []).flatMap(({ instance }) => {
                    const abs = fileMap.get(instance + '.ts')
                    if (!abs) {
                        this.warn(`observer ${instance} of ${name}: no such .ts file`)
                        return []
                    }
                    const copy = abs.replace(/(\.[^.]+)$/, `.lynx-host-${host}$1`)
                    blockCopies.set(copy, abs)
                    return [copy]
                })
                return [
                    ...observers.map((abs, i) => `import o${i} from '${toUrl(abs)}'`),
                    `export default async function (data) {`,
                    ...observers.map((_abs, i) => `    await o${i}(data)`),
                    '}',
                ].join('\n')
            }

            if (id === '\0' + VIRTUAL_PAGES) {
                const entries = [...fileMap.entries()]
                    .filter(([k]) => k.endsWith('.vue') && /(?:^|\/)Pages\//.test(k))
                    .map(([logical, abs]) => {
                        // 'Pages/About.vue'                    → 'Pages/About'
                        // 'OOCS_LynxInertia/Pages/About.vue'   → 'OOCS_LynxInertia/Pages/About'
                        const name = logical.replace(/\.vue$/, '')
                        return `  '${name}': () => import('${toUrl(abs)}'),`
                    })
                    .join('\n')
                return `export default {\n${entries}\n}`
            }

            if (id === '\0' + VIRTUAL_COMPONENTS) {
                // Statically imported by the app shell: out of the map, so the bundler inlines them into the entry.
                const INFRA_COMPONENTS = ['LayoutArea.vue', 'Messages.vue', 'DynamicNode.vue', 'Container.vue']
                const isInfra = k =>
                    INFRA_COMPONENTS.some(name => k === `Components/${name}` || k.endsWith(`/Components/${name}`))
                // Blocks are copied into their hosts at build, never loaded as nodes
                const blocks = new Set(
                    Object.values(extensions.containers ?? {}).flatMap(({ blocks }) =>
                        blocks.map(({ template }) => template + '.vue')
                    )
                )

                const entries = [...fileMap.entries()]
                    .filter(
                        ([k]) =>
                            k.endsWith('.vue') && !/(?:^|\/)(Pages|Layouts)\//.test(k) && !isInfra(k) && !blocks.has(k)
                    )
                    .map(([logical, abs]) => {
                        const key = logical.replace(/\.vue$/, '')
                        return `  '${key}': () => import('${toUrl(abs)}'),`
                    })
                    .join('\n')
                return `export default {\n${entries}\n}`
            }
        },

        // Blocks and observers into the host's own chunk; each host gets its own copy of a block
        transform(code, id) {
            if (id.startsWith('\0') || id.includes('?') || id.includes('node_modules')) return null
            const kind = id.endsWith('.vue') ? 'vue' : id.endsWith('.ts') ? 'ts' : null
            if (!kind) return null

            const host = createHash('md5')
                .update(blockCopies.get(id) ?? id)
                .digest('hex')
                .slice(0, 8)
            const out = expandExtensions(code, {
                kind,
                containers: extensions.containers ?? {},
                blockId: template => {
                    const abs = fileMap.get(template + '.vue')
                    if (!abs) throw new Error(`block ${template}: no such file`)
                    const copy = abs.replace(/(\.[^.]+)$/, `.lynx-host-${host}$1`)
                    blockCopies.set(copy, abs)
                    return copy
                },
                // Per host, like a block: a module shared by several hosts would become a chunk of its own
                eventId: name => `${EVENT_PREFIX}${host}/${name}`,
            })
            return out === null ? null : { code: out, map: null }
        },

        // After the CSS is emitted: summary sizes, chunks built from theme overrides (all with -v)
        writeBundle(_options, bundle) {
            builtFrom = []
            sizes = { chunks: 0, js: 0, jsGzip: 0, css: 0, cssGzip: 0 }

            for (const [fileName, item] of Object.entries(bundle)) {
                const kind = item.type === 'chunk' ? 'js' : fileName.endsWith('.css') ? 'css' : null
                if (kind) {
                    const code = item.type === 'chunk' ? item.code : item.source
                    sizes[kind] += Buffer.byteLength(code)
                    sizes[kind + 'Gzip'] += gzipSync(code).length
                }
                if (item.type !== 'chunk' || !item.facadeModuleId) continue

                sizes.chunks++
                const file = item.facadeModuleId.split('?')[0].replace(/\\/g, '/')
                // A theme's Vendor_Module dir, not a module's own view/frontend/lynx
                const owner = dirs.find(({ dir }) => file.startsWith(dir.replace(/\\/g, '/') + '/'))
                const override = owner?.prefix && !owner.dir.replace(/\\/g, '/').includes('/view/frontend/lynx/')
                if (verbose || override) {
                    builtFrom.push(`  ${fileName}  ←  ${file.replace(/^.*?\/(app|vendor|packages)\//, '$1/')}`)
                }
            }

            builtFrom.sort()
        },

        closeBundle() {
            if (!sizes) return

            const kb = bytes => `${(bytes / 1024).toFixed(1)} kB`
            console.log(
                `[lynx] ${sizes.chunks} chunks · JS ${kb(sizes.js)} (${kb(sizes.jsGzip)} gzip) · ` +
                    `CSS ${kb(sizes.css)} (${kb(sizes.cssGzip)} gzip) · ${((Date.now() - startedAt) / 1000).toFixed(1)}s`
            )
            if (builtFrom.length) {
                console.log(
                    `[lynx] ${verbose ? 'chunks built from' : 'built from theme overrides'}:\n${builtFrom.join('\n')}`
                )
            }
            sizes = null
            builtFrom = []
        },
    }
}

// Files taking part in fallback, relative to dir: every .vue, with `withTs` every non-declaration .ts; ssr/ skipped.
function scanVueFiles(dir, withTs = false, base = dir, result = []) {
    if (!existsSync(dir)) return result
    for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry)
        if (statSync(full).isDirectory()) {
            if (entry !== 'ssr') scanVueFiles(full, withTs, base, result)
        } else if (entry.endsWith('.vue') || (withTs && entry.endsWith('.ts') && !entry.endsWith('.d.ts'))) {
            result.push(relative(base, full).replace(/\\/g, '/'))
        }
    }
    return result
}

function toUrl(abs) {
    return abs.replace(/\\/g, '/')
}
