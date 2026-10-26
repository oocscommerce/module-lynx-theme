// What a theme imports: its whole Vite and ESLint config, and the pieces they are made of.
export * from './theme-fallback.js'
export * from './config-kit.js'
export * from './vite-config.js'
export * from './eslint-config.js'

// What laravel-precognition is aliased to (vite-config.js)
export const PRECOGNITION_STUB = new URL('./precognition-stub.js', import.meta.url).pathname

// Run before every test file (vite-config.js)
export const TEST_SETUP = new URL('./test-setup.js', import.meta.url).pathname
export * from './extensions.js'
