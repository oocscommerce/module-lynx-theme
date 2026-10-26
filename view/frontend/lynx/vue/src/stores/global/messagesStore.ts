import { defineStore } from 'pinia'

// Flash messages: the mage-messages cookie, the customer-data section and what components add themselves

export type MessageType = 'success' | 'error' | 'warning' | 'notice'

export type Message = {
    id: number
    type: MessageType
    text: string
}

const MESSAGES_COOKIE = 'mage-messages'

let nextId = 1

function drainMessagesCookie(): { type: string; text: string }[] {
    const cookiePrefix = MESSAGES_COOKIE + '='
    for (let cookie of document.cookie.split(';')) {
        cookie = cookie.trimStart()
        if (!cookie.startsWith(cookiePrefix)) continue

        let parsed: unknown = []
        try {
            parsed = JSON.parse(decodeURIComponent(cookie.slice(cookiePrefix.length)))
        } catch {
            // Malformed cookie — nothing to display.
        }
        // Clear so each message is shown exactly once (same as Luma).
        document.cookie = `${MESSAGES_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`

        return Array.isArray(parsed) ? parsed : []
    }
    return []
}

export const useMessagesStore = defineStore('messages', {
    state: () => ({
        items: [] as Message[],
    }),

    actions: {
        add(type: MessageType, text: string) {
            const id = nextId++
            // Stays until the visitor closes it
            this.items.push({ id, type, text })
        },

        remove(id: number) {
            this.items = this.items.filter(message => message.id !== id)
        },

        clear() {
            this.items = []
        },

        /** Takes whatever the server left in the cookie; true when any of it was an error. */
        sync(): boolean {
            const drained = drainMessagesCookie()

            for (const { type, text } of drained) {
                this.addServerMessage(type, text)
            }

            return drained.some(message => message.type === 'error')
        },

        /** Show messages carried by the customer-data `messages` section. */
        syncFromSection(items: { type?: string; text?: string }[]) {
            for (const { type, text } of items) {
                this.addServerMessage(type, text)
            }
        },

        /** Push one server message, mapping unknown types to a plain notice. */
        addServerMessage(type?: string, text?: string) {
            if (!text) return
            const known: MessageType[] = ['success', 'error', 'warning', 'notice']
            this.add(known.includes(type as MessageType) ? (type as MessageType) : 'notice', text)
        },
    },
})
