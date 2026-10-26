#!/usr/bin/env node
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { findProjectRoot, resolveSourceDirs } from './config-kit.js'

// ESLint over the sources this theme builds, with its eslint.config.mjs; --fix writes the fixes
const here = process.cwd()
// From the theme: this file runs from the module the kit is linked to, which has no node_modules
const { ESLint } = await import(pathToFileURL(createRequire(resolve(here, 'package.json')).resolve('eslint')).href)
const fix = process.argv.includes('--fix')
// From the Magento root: the config's patterns are written from there
const eslint = new ESLint({ cwd: findProjectRoot(here), overrideConfigFile: resolve(here, 'eslint.config.mjs'), fix })
const results = await eslint.lintFiles(resolveSourceDirs(here).map(({ dir }) => `${dir}/**/*.{ts,vue}`))
if (fix) await ESLint.outputFixes(results)

const report = await (await eslint.loadFormatter('stylish')).format(results)
if (report) console.log(report)
process.exitCode = results.some(result => result.errorCount > 0) ? 1 : 0
