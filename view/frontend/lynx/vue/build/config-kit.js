import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
    discoverModuleVueSrcDirs,
    discoverParentThemeDirs,
    discoverThemeOverrideDirs,
    readParentThemeDirs,
} from './theme-fallback.js'

// The parts of a Lynx theme's Vite config that say nothing about the theme: chunk naming, the SRI
// manifest, the CSS move, the Worker build. defineLynxConfig (vite-config.js) puts them together.

/** The Magento root, the directory holding bin/magento: lint patterns span the theme and the modules from there. */
export function findProjectRoot(from) {
    for (let dir = from; ; dir = dirname(dir)) {
        if (existsSync(resolve(dir, 'bin/magento'))) return dir
        if (dirname(dir) === dir) throw new Error(`[lynx] found no bin/magento above ${from}.`)
    }
}

/** A package as the theme's build root resolves it: the kit runs from a module, which has no node_modules. */
export function importFrom(lynxDir, name) {
    return import(pathToFileURL(createRequire(resolve(lynxDir, 'package.json')).resolve(name)).href)
}

/**
 * Source dirs, highest priority first: the theme's src/, its module overrides, the same two of each parent
 * theme, then the modules. The build root sits beside web/: static deploy publishes everything under web/.
 *
 * @param {string} lynxDir The theme's build root, the directory holding vite.config.js
 */
export function resolveSourceDirs(lynxDir) {
    const themeDir = resolve(lynxDir, '..')
    const moduleSrcDirs = discoverModuleVueSrcDirs(lynxDir)
    const enabled = new Set(moduleSrcDirs.map(({ prefix }) => prefix))

    return [
        { dir: resolve(lynxDir, 'src'), prefix: '' },
        ...discoverThemeOverrideDirs(themeDir, enabled),
        ...discoverParentThemeDirs(readParentThemeDirs(lynxDir), enabled),
        ...moduleSrcDirs,
    ]
}

/**
 * Tests of the build: test/ beside each source dir mirrors it. A test runs only from the dir whose source file
 * wins fallback, so an override drops the original's test; a test of no source file runs from the highest dir.
 *
 * @param {{dir: string, prefix: string}[]} srcDirs As resolveSourceDirs returns them
 * @returns {string[]} Absolute paths
 */
export function resolveTestFiles(srcDirs) {
    const tests = new Map()
    for (const { dir, prefix } of srcDirs) {
        const testDir = resolve(dir, '..', 'test')
        for (const file of scanTestFiles(testDir)) {
            const logical = file.replace(/\.test\.tsx?$/, '')
            const key = prefix ? `${prefix}/${logical}` : logical
            tests.set(key, [...(tests.get(key) ?? []), { dir, path: resolve(testDir, file) }])
        }
    }

    const ownerOf = key =>
        srcDirs.find(({ dir, prefix }) => {
            const logical = !prefix ? key : key.startsWith(prefix + '/') ? key.slice(prefix.length + 1) : null
            return logical !== null && ['.vue', '.ts'].some(ext => existsSync(resolve(dir, logical + ext)))
        })?.dir

    return [...tests].flatMap(([key, candidates]) => {
        const owner = ownerOf(key)
        const test = owner ? candidates.find(({ dir }) => dir === owner) : candidates[0]
        return test ? [test.path] : []
    })
}

function scanTestFiles(dir, base = dir, result = []) {
    if (!existsSync(dir)) return result
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name)
        if (entry.isDirectory()) scanTestFiles(full, base, result)
        else if (/\.test\.tsx?$/.test(entry.name)) result.push(relative(base, full).replace(/\\/g, '/'))
    }
    return result
}

// Utils every page loads ride in components.min.js. Listed by hand: getModuleInfo() throws inside a codeSplitting
// name function, and a util the entry imports but is not listed costs main.min.js a chunk of one file.
export const CORE_UTIL_CHUNKS = ['OOCS_LynxTheme/utils/price', 'OOCS_LynxTheme/utils/storeConfig']

// Stores every page needs ride in components.min.js too; the directory is the rule in any module, so a
// third-party module opts in by placing a store under its stores/global/. A feature's store stays in its module.
export const GLOBAL_STORES_DIR = '/src/stores/global/'

/** The registry, beside DynamicNode in OOCS_LynxTheme (or a theme's override of it, which answers the same key). */
export const REGISTRY_KEY = 'OOCS_LynxTheme/componentRegistry.ts'

/** The two names the chunking rules are written in terms of, bound to the build's source directories. */
export function createChunkNaming(srcDirs) {
    // The key a file is imported under ('OOCS_LynxCatalog/Components/ProductListing.vue', 'main.ts'): the inverse of
    // theme fallback, so an override lands in the chunk of the file it replaces. Null outside the src dirs.
    function sourceKey(id) {
        const path = id.split('?')[0]
        for (const { dir, prefix } of srcDirs) {
            const root = resolve(dir)
            if (!path.startsWith(root + '/') && !path.startsWith(root + sep)) continue
            const logical = path.slice(root.length + 1).replace(/\\/g, '/')
            return prefix ? `${prefix}/${logical}` : logical
        }
        return null
    }

    /** Chunk name of a src/utils/ module: its path from src/, no extension, module-prefixed. Null outside utils/. */
    function utilChunkName(id) {
        for (const { dir, prefix } of srcDirs) {
            const utils = resolve(dir, 'utils')
            if (!id.startsWith(utils + '/') && !id.startsWith(utils + sep)) continue
            const logical = id.slice(resolve(dir).length + 1).replace(/\.tsx?$/, '')
            return prefix ? `${prefix}/${logical}` : logical
        }
        return null
    }

    return { sourceKey, utilChunkName }
}

// Rewrites the manifest for Model\Sri: one entry per JS chunk keyed by output file, with its sha256 `integrity` and
// the import graph. Hashed here because .min files are copied as they are and developer mode has no deploy.
export function sriManifestPlugin() {
    let outDir = ''
    let manifestPath = null
    return {
        name: 'lynx-sri-manifest',
        apply: 'build',
        configResolved(config) {
            outDir = config.build.outDir
            manifestPath = config.build.manifest ? resolve(outDir, config.build.manifest) : null
        },
        closeBundle() {
            if (!manifestPath || !existsSync(manifestPath)) return
            const vite = JSON.parse(readFileSync(manifestPath, 'utf8'))
            // Vite keys `imports` by manifest key (the source path); map them to file names.
            const fileOf = key => vite[key]?.file ?? key
            const manifest = {}
            for (const entry of Object.values(vite)) {
                if (typeof entry.file !== 'string' || !entry.file.endsWith('.js')) continue
                const content = readFileSync(resolve(outDir, entry.file))
                manifest[entry.file] = {
                    file: entry.file,
                    integrity: 'sha256-' + createHash('sha256').update(content).digest('base64'),
                    ...(entry.isEntry ? { isEntry: true } : {}),
                    ...(entry.imports?.length ? { imports: entry.imports.map(fileOf) } : {}),
                    ...(entry.dynamicImports?.length ? { dynamicImports: entry.dynamicImports.map(fileOf) } : {}),
                }
            }
            writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
        },
    }
}

/** Writes dist/sources.css: a Tailwind @source per source dir except the theme's own, relative to that file. */
export function tailwindSourcesPlugin(lynxDir, srcDirs) {
    return {
        name: 'lynx-tailwind-sources',
        config() {
            const outDir = resolve(lynxDir, 'dist')
            const own = resolve(lynxDir, 'src')
            const lines = srcDirs
                .filter(({ dir }) => resolve(dir) !== own)
                .map(({ dir }) => `@source "${relative(outDir, dir).replace(/\\/g, '/')}/**/*.{vue,ts}";`)
            mkdirSync(outDir, { recursive: true })
            writeFileSync(
                resolve(outDir, 'sources.css'),
                '/* Generated by the Lynx build — do not edit. */\n' + lines.join('\n') + '\n'
            )
        },
    }
}

/**
 * Vitest caches a transformed module by its own content, but a .vue's runtime props come from dist/props.d.ts too
 * (globalTypeFiles): its hash joins the key, so tests do not run a component built from an older .graphqls.
 */
export function propsTypesCachePlugin(propsFile) {
    return {
        name: 'lynx-props-types-cache',
        configureVitest({ defineCacheKeyGenerator }) {
            const digest = existsSync(propsFile) ? createHash('sha1').update(readFileSync(propsFile)).digest('hex') : ''
            defineCacheKeyGenerator(({ id }) => (id.includes('.vue') ? digest : undefined))
        },
    }
}

/** Move the merged CSS out of js/lynx/ into css/lynx/ after build. */
export function moveCssPlugin(lynxDir) {
    return {
        name: 'move-css',
        apply: 'build',
        closeBundle() {
            const src = resolve(lynxDir, '../web/js/lynx/styles.min.css')
            const dest = resolve(lynxDir, '../web/css/lynx/styles.min.css')
            if (!existsSync(src)) return
            mkdirSync(resolve(lynxDir, '../web/css/lynx'), { recursive: true })
            renameSync(src, dest)
        },
    }
}

// Overrides for `npm run build:ssr:worker`: the renderer as one Cloudflare Worker file (src/ssr-worker.ts). The
// webworker target resolves every dependency to its browser side and fails the build on one that has none.
export function workerBuild(lynxDir) {
    return {
        outDir: resolve(lynxDir, 'dist/ssr/worker'),
        emptyOutDir: true,
        target: 'esnext',
        minify: true,
        // wrangler uploads the map alongside; a failed render then names the .vue file in the Cloudflare log.
        sourcemap: true,

        rolldownOptions: {
            input: resolve(lynxDir, 'src/ssr-worker.ts'),
            output: {
                entryFileNames: 'worker.mjs',
                format: 'esm',
                // One file: a Worker does not load chunks from a directory beside it.
                codeSplitting: false,
            },
        },
    }
}
