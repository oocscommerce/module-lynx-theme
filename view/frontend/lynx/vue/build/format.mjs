#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveSourceDirs } from './config-kit.js'

// Prettier with the kit's options over the theme's build root and each source's lynx/vue folder; --check only reports
const here = process.cwd()
const require = createRequire(resolve(here, 'package.json'))
const manifest = require.resolve('prettier/package.json')
const { bin } = require(manifest)
const roots = [...new Set(resolveSourceDirs(here).map(({ dir }) => resolve(dir, '..')))]

const { status } = spawnSync(
    process.execPath,
    [
        resolve(dirname(manifest), typeof bin === 'string' ? bin : bin.prettier),
        process.argv.includes('--check') ? '--check' : '--write',
        '--config',
        fileURLToPath(new URL('./prettier.config.js', import.meta.url)),
        ...roots.map(root => `${root}/**/*.{ts,vue,js,mjs}`),
    ],
    { stdio: 'inherit' }
)
process.exitCode = status ?? 1
