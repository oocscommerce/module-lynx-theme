<script setup lang="ts">
import { onMounted, onUnmounted, reactive, watch } from 'vue'
import { useMessagesStore } from 'OOCS_LynxTheme/stores/global/messagesStore'
import { config } from 'OOCS_LynxTheme/utils/storeConfig'

const messages = useMessagesStore()
// Not a layout node, so no provider: the string comes with the store config.
const labels = config<Record<string, string>>('labels', {})

/**
 * Server messages may carry markup
 */
const ALLOWED_TAGS = ['div', 'span', 'b', 'strong', 'i', 'em', 'u', 'a']
const ALLOWED_ATTRS = ['id', 'class', 'href', 'title', 'style']
const FORBIDDEN_ATTRS: Record<string, string[]> = { a: ['style'] }

function sanitize(text: string): string {
    const root = new DOMParser().parseFromString('<div></div>', 'text/html').body.firstElementChild!
    root.innerHTML = text

    // Comments carry nothing to display.
    const comments = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT)
    const toDelete: Node[] = []
    while (comments.nextNode()) toDelete.push(comments.currentNode)
    toDelete.forEach(node => node.parentNode?.removeChild(node))

    const elements = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT)
    const toUnwrap: Element[] = []
    while (elements.nextNode()) {
        const element = elements.currentNode as Element
        const tag = element.nodeName.toLowerCase()

        if (!ALLOWED_TAGS.includes(tag)) {
            // Keep the text, drop the element itself — as core does.
            toUnwrap.push(element)
            continue
        }

        for (const attribute of [...element.attributes]) {
            if (!ALLOWED_ATTRS.includes(attribute.name) || FORBIDDEN_ATTRS[tag]?.includes(attribute.name)) {
                element.removeAttribute(attribute.name)
            }
        }
    }
    toUnwrap.forEach(element =>
        element.parentNode?.replaceChild(document.createTextNode(element.textContent ?? ''), element)
    )

    return root.innerHTML
}

/** Type-colored bottom border. */
const BAR: Record<string, string> = {
    success: 'bg-success',
    error: 'bg-error',
    warning: 'bg-warning',
    notice: 'bg-info',
}

const ICON_COLOR: Record<string, string> = {
    success: 'text-success',
    error: 'text-error',
    warning: 'text-warning',
    notice: 'text-base-content/50',
}

// Success and notice close on their own; an error or a warning waits for the visitor
const AUTO_CLOSE = ['success', 'notice']
const AUTO_CLOSE_MS = 15000

// Per message: time left, and the running timeout while it counts down
const timers = new Map<number, { left: number; since: number; handle?: ReturnType<typeof setTimeout> }>()
// Messages counting down right now: their bar runs, every other bar stands still
const counting = reactive(new Set<number>())

function run(id: number) {
    const timer = timers.get(id)
    // A tab in the background starts nothing: the message waits for the visitor to come back
    if (!timer || timer.handle || document.hidden) return
    timer.since = Date.now()
    timer.handle = setTimeout(() => messages.remove(id), timer.left)
    counting.add(id)
}

/** Held while the pointer is over the message or focus is inside it */
function hold(id: number) {
    const timer = timers.get(id)
    if (!timer?.handle) return
    clearTimeout(timer.handle)
    timer.handle = undefined
    timer.left -= Date.now() - timer.since
    counting.delete(id)
}

/** Runs again once neither the pointer nor the focus is left on the message */
function release(id: number, event: MouseEvent | FocusEvent) {
    const box = event.currentTarget as HTMLElement
    const focusMovesIn = event instanceof FocusEvent && box.contains(event.relatedTarget as Node | null)
    if (focusMovesIn || box.matches(':hover') || (event.type !== 'focusout' && box.matches(':focus-within'))) return
    run(id)
}

// A new message starts its countdown; a closed one drops its timer
watch(
    () => messages.items.map(message => message.id),
    ids => {
        for (const message of messages.items) {
            if (AUTO_CLOSE.includes(message.type) && !timers.has(message.id)) {
                timers.set(message.id, { left: AUTO_CLOSE_MS, since: 0 })
                run(message.id)
            }
        }
        for (const [id, timer] of timers) {
            if (!ids.includes(id)) {
                clearTimeout(timer.handle)
                timers.delete(id)
                counting.delete(id)
            }
        }
    },
    { immediate: true }
)

// Every countdown holds while the tab is in the background and runs again when it is back
function onVisibility() {
    for (const id of timers.keys()) {
        if (document.hidden) hold(id)
        else run(id)
    }
}
onMounted(() => document.addEventListener('visibilitychange', onVisibility))

// ── Swipe to close: touch and pen only, a mouse keeps selecting text ──────────

// Past a third of the message, or a flick (px per ms), it closes; short of that it slides back
const SWIPE_SHARE = 1 / 3
const SWIPE_SPEED = 0.5
const LEAVE_MS = 200

const swipe = reactive({ id: 0, startX: 0, startAt: 0, width: 1, dx: 0, leaving: 0 })

function swipeStart(id: number, event: PointerEvent) {
    if (event.pointerType === 'mouse' || swipe.id) return
    const box = event.currentTarget as HTMLElement
    box.setPointerCapture?.(event.pointerId)
    Object.assign(swipe, {
        id,
        startX: event.clientX,
        startAt: event.timeStamp,
        width: box.offsetWidth || 1,
        dx: 0,
        leaving: 0,
    })
    hold(id)
}

function swipeMove(id: number, event: PointerEvent) {
    if (swipe.id === id && !swipe.leaving) swipe.dx = event.clientX - swipe.startX
}

function swipeEnd(id: number, event: PointerEvent) {
    if (swipe.id !== id || swipe.leaving) return
    const distance = Math.abs(swipe.dx)
    const speed = distance / Math.max(1, event.timeStamp - swipe.startAt)
    if (
        event.type === 'pointerup' &&
        (distance > swipe.width * SWIPE_SHARE || (distance > 30 && speed > SWIPE_SPEED))
    ) {
        // Off the side it went, then gone; at once where motion is reduced
        swipe.leaving = Math.sign(swipe.dx)
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        setTimeout(
            () => {
                messages.remove(id)
                Object.assign(swipe, { id: 0, dx: 0, leaving: 0 })
            },
            reduced ? 0 : LEAVE_MS
        )
        return
    }
    Object.assign(swipe, { id: 0, dx: 0 })
    run(id)
}

/** Where the message being swiped sits: under the finger, or on its way out */
function swipeStyle(id: number) {
    if (swipe.id !== id) return undefined
    if (swipe.leaving) return { transform: `translateX(${swipe.leaving * 110}%)`, opacity: '0' }
    return {
        transform: `translateX(${swipe.dx}px)`,
        opacity: String(1 - Math.min(1, Math.abs(swipe.dx) / swipe.width)),
        transition: 'none',
    }
}

onUnmounted(() => {
    document.removeEventListener('visibilitychange', onVisibility)
    timers.forEach(timer => clearTimeout(timer.handle))
})
</script>

<template>
    <!-- Toast stack: fixed bottom, right side on desktop -->
    <div
        v-if="messages.items.length"
        class="fixed bottom-0 inset-x-0 z-[90] mb-4 px-4 grid gap-3 justify-items-center pointer-events-none lg:inset-x-auto lg:end-8 lg:px-0 lg:justify-items-end print:hidden"
    >
        <div
            v-for="message in messages.items"
            :key="message.id"
            class="l-alert relative overflow-hidden grid-cols-[auto_1fr_auto] items-start w-[20rem] max-w-full pb-5 shadow-menu pointer-events-auto touch-pan-y transition-[transform,opacity] duration-200 motion-reduce:transition-none"
            role="alert"
            :style="swipeStyle(message.id)"
            @pointerdown="swipeStart(message.id, $event)"
            @pointermove="swipeMove(message.id, $event)"
            @pointerup="swipeEnd(message.id, $event)"
            @pointercancel="swipeEnd(message.id, $event)"
            @mouseenter="hold(message.id)"
            @focusin="hold(message.id)"
            @mouseleave="release(message.id, $event)"
            @focusout="release(message.id, $event)"
        >
            <!-- Type-colored bottom border; on a message that closes on its own, the bar counting down to it -->
            <span
                class="absolute bottom-0 start-0 h-1 w-full"
                :class="[
                    BAR[message.type] ?? BAR.notice,
                    AUTO_CLOSE.includes(message.type) ? 'ltr:origin-left rtl:origin-right animate-toast-timer' : '',
                    counting.has(message.id) ? '' : '[animation-play-state:paused]',
                ]"
            ></span>
            <!-- Type icon -->
            <svg
                class="h-5 w-5 shrink-0"
                :class="ICON_COLOR[message.type] ?? ICON_COLOR.notice"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
            >
                <template v-if="message.type === 'success'">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M22 4 12 14.01l-3-3" />
                </template>
                <template v-else-if="message.type === 'warning'">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
                    />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4M12 17h.01" />
                </template>
                <template v-else>
                    <circle stroke-linecap="round" stroke-linejoin="round" cx="12" cy="12" r="10" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4M12 16h.01" />
                </template>
            </svg>

            <p
                class="leading-snug [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-2"
                v-html="sanitize(message.text)"
            ></p>

            <button
                type="button"
                :aria-label="labels.dismissMessage"
                class="inline-flex items-center justify-center min-h-10 min-w-10 -my-2.5 -me-2.5 text-base-content/50 hover:text-base-content bg-transparent border-none cursor-pointer transition-colors"
                @click="messages.remove(message.id)"
            >
                <!-- A 40px target around a 20px icon; the negative margin keeps the message from growing -->
                <svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                        d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z"
                    />
                </svg>
            </button>
        </div>
        <button
            v-if="messages.items.length > 1"
            type="button"
            class="l-btn l-btn-sm w-[20rem] max-w-full justify-center text-center shadow-menu pointer-events-auto"
            @click="messages.clear()"
        >
            {{ labels.dismissAllMessages }}
        </button>
    </div>
</template>
