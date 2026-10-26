import { defineStore } from 'pinia'
import { config } from 'OOCS_LynxTheme/utils/storeConfig'

/** Default Cookie Settings, as the store config block exposes them. */
type CookieConfig = {
    path?: string
    domain?: string
    lifetime?: number
    secure?: boolean
    samesite?: string
}

const COOKIE_NAME = 'form_key'
const KEY_LENGTH = 16
const KEY_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

function readCookie(name: string): string | null {
    const cookiePrefix = name + '='
    for (let cookie of document.cookie.split(';')) {
        cookie = cookie.trimStart()
        if (cookie.startsWith(cookiePrefix)) return cookie.slice(cookiePrefix.length)
    }
    return null
}

/**
 * A key of the shape core mints
 */
function mint(): string {
    const bytes = new Uint8Array(KEY_LENGTH)
    crypto.getRandomValues(bytes)

    let key = ''
    for (const byte of bytes) {
        key += KEY_CHARS[byte % KEY_CHARS.length]
    }
    return key
}

function writeCookie(value: string): void {
    const cookie = config<CookieConfig>('cookie', {})
    const lifetime = Number(cookie.lifetime) || 0

    // A lifetime of 0 means a session cookie, which is what core writes too.
    const expires = lifetime > 0 ? '; expires=' + new Date(Date.now() + lifetime * 1000).toUTCString() : ''

    document.cookie =
        `${COOKIE_NAME}=${value}${expires}` +
        `; path=${cookie.path || '/'}` +
        (cookie.domain ? `; domain=${cookie.domain}` : '') +
        (cookie.secure ? '; secure' : '') +
        `; samesite=${cookie.samesite || 'Lax'}`
}

/**
 * CSRF form key, minted and kept alive client-side
 */
export const useFormKeyStore = defineStore('formKey', {
    state: () => ({
        value: '',
    }),

    actions: {
        /** The key to POST with, matching a cookie that exists as of right now. */
        ensure(): string {
            const cookie = readCookie(COOKIE_NAME)
            if (cookie) {
                this.value = cookie
                return cookie
            }

            const minted = mint()
            writeCookie(minted)
            this.value = minted
            return minted
        },

        /** Re-read the cookie, minting one if it has gone. */
        sync() {
            this.ensure()
        },
    },
})
