import path from 'node:path'
import { findProjectRoot, importFrom } from './config-kit.js'
import { readModuleDirs } from './theme-fallback.js'

/**
 * The ESLint flat config of a theme's build root; `extra` configs are appended, so a later entry overrides a rule.
 *
 * @param {string} lynxDir The theme's build root (import.meta.dirname of its eslint.config.mjs)
 * @param {...object} extra
 * @returns {Promise<object[]>}
 */
export async function defineLynxEslint(lynxDir, ...extra) {
    // From the theme: the kit runs from a module, which has no node_modules
    const [
        { default: js },
        { fixupPluginRules },
        { defineConfig, globalIgnores },
        { default: ssrFriendly },
        { default: vue },
        { default: globals },
        { default: tseslint },
        { default: vueParser },
    ] = await Promise.all(
        [
            '@eslint/js',
            '@eslint/compat',
            'eslint/config',
            'eslint-plugin-ssr-friendly',
            'eslint-plugin-vue',
            'globals',
            'typescript-eslint',
            'vue-eslint-parser',
        ].map(name => importFrom(lynxDir, name))
    )

    // Logic rules only: formatting is Prettier's (.prettierrc at the project root).

    // Patterns are relative to the project root, like the paths tsconfig.modules.json is generated with.
    const ROOT = findProjectRoot(lynxDir)
    // This theme's build root as seen from ROOT, wherever the theme is installed.
    const THEME = path.relative(ROOT, lynxDir).replace(/\\/g, '/')
    // Only the modules that go into the bundle: tsconfig.modules.json covers exactly these.
    const MODULES = Object.values(readModuleDirs(lynxDir)).map(dir => path.relative(ROOT, dir))

    const SRC = [...MODULES.map(dir => `${dir}/view/frontend/lynx/vue/src/**/*.{ts,vue}`), `${THEME}/src/**/*.{ts,vue}`]
    // Server-only entry points: no DOM, node/worker globals allowed.
    const SERVER = [
        '**/lynx/src/ssr.ts',
        '**/lynx/src/ssr-worker.ts',
        '**/lynx/vue/src/ssr{Render,Server,Worker}.ts',
        '**/lynx/src/ssr/**',
    ]
    // Client-only entry points: never rendered on the server.
    const CLIENT = ['**/lynx/src/main.ts', '**/lynx/vue/src/storefront.ts']

    return defineConfig([
        globalIgnores(['**/node_modules/**', '**/build/**', '**/dist/**']),
        {
            basePath: ROOT,
            files: SRC,
            extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked, vue.configs['flat/essential']],
            languageOptions: {
                parser: vueParser,
                globals: globals.browser,
                parserOptions: {
                    parser: tseslint.parser,
                    project: [`${THEME}/tsconfig.modules.json`],
                    tsconfigRootDir: ROOT,
                    extraFileExtensions: ['.vue'],
                },
            },
            // Written for the ESLint 8 rule API; the shim provides the context methods ESLint 10 removed.
            plugins: { 'ssr-friendly': fixupPluginRules(ssrFriendly) },
            rules: {
                'no-eval': 'error',
                'no-implied-eval': 'error',
                'no-new-func': 'error',
                'no-script-url': 'error',
                // A <script setup> body is module scope: a DOM global read there runs on the SSR server.
                'ssr-friendly/no-dom-globals-in-module-scope': 'error',
                // <component is="style"> is a native tag under a dynamic name: a static `is` is valid, and v-html replaces no component content.
                'vue/require-component-is': 'off',
                'vue/no-v-text-v-html-on-component': ['error', { allow: ['component'] }],
                'vue/no-unused-refs': 'error',
                'vue/prefer-import-from-vue': 'error',
                'vue/require-explicit-emits': 'error',
                'vue/no-mutating-props': 'error',
                // Server-sanitized HTML (CMS, product description) has to be rendered somewhere.
                'vue/no-v-html': 'off',
                // Components are registered by path, and props mirror the PHP provider keys (snake_case).
                'vue/multi-word-component-names': 'off',
                'vue/prop-name-casing': 'off',
                // Props arrive as JSON from PHP, typed loosely on purpose.
                '@typescript-eslint/no-unsafe-member-access': 'off',
                '@typescript-eslint/no-unsafe-assignment': 'off',
                '@typescript-eslint/no-unsafe-call': 'off',
                '@typescript-eslint/no-unsafe-argument': 'off',
                '@typescript-eslint/no-unsafe-return': 'off',
                // Reports `{} as Record<…>` in Pinia state as unnecessary while vue-tsc needs it.
                '@typescript-eslint/no-unnecessary-type-assertion': 'off',
                // An async handler on onClick/onSubmit or in setTimeout is fine: its rejection is handled inside it.
                '@typescript-eslint/no-misused-promises': [
                    'error',
                    { checksVoidReturn: { attributes: false, arguments: false } },
                ],
                // `const { id, ...rest } = obj` omits keys on purpose.
                '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
                // `cond ? a() : b()` and `x && f()` as statements are fine.
                '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true, allowShortCircuit: true }],
                // APIs marked @deprecated in their types: caught here before a framework upgrade removes them.
                '@typescript-eslint/no-deprecated': 'error',
                // vue-tsc resolves names in TypeScript SFCs; no-undef only sees the script and flags ambient types.
                'no-undef': 'off',
                'no-console': ['error', { allow: ['warn', 'error'] }],
            },
        },
        {
            basePath: ROOT,
            files: SERVER,
            languageOptions: { globals: { ...globals.node, ...globals['shared-node-browser'] } },
            rules: { 'ssr-friendly/no-dom-globals-in-module-scope': 'off' },
        },
        {
            basePath: ROOT,
            files: CLIENT,
            rules: { 'ssr-friendly/no-dom-globals-in-module-scope': 'off' },
        },
        ...extra,
    ])
}
