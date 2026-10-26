import { resolve } from 'node:path'
import {
    findProjectRoot,
    importFrom,
    moveCssPlugin,
    propsTypesCachePlugin,
    resolveSourceDirs,
    resolveTestFiles,
    sriManifestPlugin,
    tailwindSourcesPlugin,
    workerBuild,
} from './config-kit.js'
import { PRECOGNITION_STUB, TEST_SETUP } from './index.js'
import { readDependencyNames, vueThemeFallback } from './theme-fallback.js'

/**
 * Vite config of a theme; `overrides` (object or fn of env) merge over it, the theme's rollupOptions included
 *
 * @param {string} lynxDir The theme's build root (import.meta.dirname of its vite.config.js)
 * @param {object|Function} [overrides]
 * @returns {Function}
 */
export function defineLynxConfig(lynxDir, overrides = {}) {
    return async env => {
        // From the theme: the kit's module has no node_modules
        const [{ mergeConfig }, { default: tailwindcss }, { default: vue }] = await Promise.all(
            ['vite', '@tailwindcss/vite', '@vitejs/plugin-vue'].map(name => importFrom(lynxDir, name))
        )
        const own = typeof overrides === 'function' ? await overrides(env) : overrides
        const config = mergeConfig(baseConfig(lynxDir, env, tailwindcss, vue), own)

        // Replaced, not merged: client options must not reach SSR. mergeConfig copies rollupOptions to
        // rolldownOptions, which wins, so both go.
        if (env.isSsrBuild) {
            delete config.build.rollupOptions
            delete config.build.rolldownOptions
            config.build = { ...config.build, ...(env.mode === 'worker' ? workerBuild(lynxDir) : nodeBuild(lynxDir)) }
        }

        return config
    }
}

/** `npm run build:ssr`: the Node renderer, never served */
function nodeBuild(lynxDir) {
    return {
        outDir: resolve(lynxDir, 'dist/ssr/nodejs'),
        emptyOutDir: true,
        // Oldest supported Node (EOL 2027-04-30)
        target: 'node22',
        // Drops debugger and region comments; console.* stays
        minify: true,
        // Render errors name the .vue file
        sourcemap: true,

        rolldownOptions: {
            input: resolve(lynxDir, 'src/ssr.ts'),
            output: {
                // .mjs: no package.json beside it to mark .js as ESM
                entryFileNames: 'server.mjs',
                format: 'esm',
                // One file: the server loads every page anyway
                codeSplitting: false,
            },
        },
    }
}

/** Config shared by every theme, before overrides */
function baseConfig(lynxDir, { command, isSsrBuild, mode }, tailwindcss, vue) {
    const allSrcDirs = resolveSourceDirs(lynxDir)

    // Lynx.* props types, written by lynx:static:deploy
    const PROPS_TYPES = resolve(lynxDir, 'dist/props.d.ts')

    return {
        // Per-file table only with lynx:static:deploy -v
        logLevel: command === 'build' && !process.env.LYNX_BUILD_VERBOSE ? 'warn' : 'info',

        plugins: [
            tailwindSourcesPlugin(lynxDir, allSrcDirs),
            tailwindcss(),
            // Lynx.* is global: runtime props come from it
            vue({ script: { globalTypeFiles: [PROPS_TYPES] } }),
            propsTypesCachePlugin(PROPS_TYPES),
            vueThemeFallback(allSrcDirs),
            sriManifestPlugin(),
            moveCssPlugin(lynxDir),
        ],

        server: {
            port: 5173,
            origin: 'http://localhost:5173',
            // Kit and modules live outside the build root
            fs: { allow: [findProjectRoot(lynxDir)] },
        },

        ssr: {
            // Bundle everything: the server bundle runs without node_modules
            noExternal: true,
            // build:ssr:worker resolves for a browser-like runtime
            ...(mode === 'worker' ? { target: 'webworker' } : {}),
        },

        // All <script setup>: 4.6 kB off vendor-vue
        define: {
            __VUE_OPTIONS_API__: 'false',
        },

        experimental: {
            // Relative URLs keep /static/<version>/; CSS moves to css/lynx/, assets stay in js/lynx/
            renderBuiltUrl(filename, { hostType }) {
                if (hostType === 'css') {
                    return `../../js/lynx/${filename}`
                }
            },
        },

        build: {
            outDir: resolve(lynxDir, '../web/js/lynx'),
            emptyOutDir: true,
            target: 'esnext',
            modulePreload: false,
            // Read by Model\Sri; sriManifestPlugin adds hashes
            manifest: isSsrBuild ? false : 'manifest.json',
        },

        // Tests picked by the same fallback as sources
        test: {
            environment: 'happy-dom',
            include: resolveTestFiles(allSrcDirs),
            passWithNoTests: true,
            setupFiles: [TEST_SETUP],
            maxWorkers: 4,
        },

        resolve: {
            // .lynx packages resolve from here, also for modules under vendor/
            dedupe: readDependencyNames(lynxDir),
            alias: {
                '@': resolve(lynxDir, 'src'),
                'laravel-precognition': PRECOGNITION_STUB,
            },
        },
    }
}
