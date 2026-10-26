// Runs before every test file (setupFiles): each test starts with nothing mounted and no cookies, storage, markup, mocks or stubs.
import { afterEach, vi } from 'vitest'
import { unmountAll } from './test-utils.js'

afterEach(() => {
    unmountAll()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    for (const cookie of document.cookie.split(';')) {
        const name = cookie.split('=')[0].trim()
        if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    }
    localStorage.clear()
    sessionStorage.clear()
    document.body.innerHTML = ''
})
