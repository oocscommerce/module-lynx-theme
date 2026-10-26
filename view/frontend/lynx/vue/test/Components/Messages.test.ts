import { hydrate, mountNode } from '@oocs/module-lynx-theme/test'
import Messages from 'OOCS_LynxTheme/Components/Messages.vue'
import { useMessagesStore } from 'OOCS_LynxTheme/stores/global/messagesStore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const config = { labels: { dismissMessage: 'Dismiss message', dismissAllMessages: 'Dismiss all' } }

async function withMessages(...texts: [string, string][]) {
    const wrapper = mountNode(Messages, { config })
    const store = useMessagesStore()
    for (const [type, text] of texts) store.addServerMessage(type, text)
    await nextTick()
    return { wrapper, store }
}

describe('Messages', () => {
    it('renders nothing without messages', async () => {
        const { wrapper } = await withMessages()

        expect(wrapper.find('div').exists()).toBe(false)
    })

    it('shows every message from the store', async () => {
        const { wrapper } = await withMessages(['success', 'Added to cart'], ['error', 'Out of stock'])

        expect(wrapper.findAll('[role="alert"]').map(alert => alert.text())).toEqual(['Added to cart', 'Out of stock'])
    })

    it('keeps the allowed markup of a server message and drops the rest', async () => {
        const { wrapper } = await withMessages([
            'notice',
            '<strong>Saved</strong> <a href="/cart" style="color:red" onclick="steal()">View cart</a> <img src="x" onerror="steal()"><script>steal()</script><!-- note -->',
        ])
        const alert = wrapper.find('[role="alert"] p')

        expect(alert.find('strong').text()).toBe('Saved')
        expect(alert.find('a').attributes()).toEqual({ href: '/cart' })
        expect(alert.find('img').exists()).toBe(false)
        expect(alert.find('script').exists()).toBe(false)
        expect(alert.html()).not.toContain('note')
    })

    it('closes one message', async () => {
        const { wrapper, store } = await withMessages(['success', 'Added to cart'], ['error', 'Out of stock'])

        await wrapper.findAll('[aria-label="Dismiss message"]')[0].trigger('click')

        expect(store.items.map(message => message.text)).toEqual(['Out of stock'])
        expect(wrapper.text()).not.toContain('Added to cart')
    })

    it('clears all messages, offered only for more than one', async () => {
        const single = await withMessages(['success', 'Added to cart'])
        expect(single.wrapper.text()).not.toContain('Dismiss all')

        const { wrapper, store } = await withMessages(['success', 'Added to cart'], ['error', 'Out of stock'])
        const clear = wrapper.findAll('button').find(button => button.text() === 'Dismiss all')
        await clear!.trigger('click')

        expect(store.items).toEqual([])
        expect(wrapper.find('div').exists()).toBe(false)
    })

    it('server-renders and hydrates the same markup', async () => {
        const { html, warnings } = await hydrate(Messages, { config })

        expect(html).not.toContain('role="alert"')
        expect(warnings).toEqual([])
    })

    it('closes success and notice after 15 seconds and keeps errors and warnings', async () => {
        vi.useFakeTimers()
        const { wrapper } = await withMessages(
            ['success', 'Added to cart'],
            ['notice', 'Note'],
            ['error', 'Out of stock'],
            ['warning', 'Low stock']
        )
        const texts = () => wrapper.findAll('[role="alert"]').map(alert => alert.text())

        vi.advanceTimersByTime(14_999)
        await nextTick()
        expect(texts()).toHaveLength(4)

        vi.advanceTimersByTime(1)
        await nextTick()
        expect(texts()).toEqual(['Out of stock', 'Low stock'])
        vi.useRealTimers()
    })

    it('holds the countdown while the pointer is over the message', async () => {
        vi.useFakeTimers()
        const { wrapper } = await withMessages(['success', 'Added to cart'])

        const bar = () => wrapper.find('[role="alert"] > span').classes()
        expect(bar()).toContain('animate-toast-timer')
        expect(bar()).not.toContain('[animation-play-state:paused]')

        vi.advanceTimersByTime(5_000)
        await wrapper.find('[role="alert"]').trigger('mouseenter')
        expect(bar()).toContain('[animation-play-state:paused]')
        vi.advanceTimersByTime(60_000)
        await nextTick()
        expect(wrapper.find('[role="alert"]').exists()).toBe(true)

        await wrapper.find('[role="alert"]').trigger('mouseleave')
        vi.advanceTimersByTime(9_999)
        await nextTick()
        expect(wrapper.find('[role="alert"]').exists()).toBe(true)
        vi.advanceTimersByTime(1)
        await nextTick()
        expect(wrapper.find('[role="alert"]').exists()).toBe(false)
        vi.useRealTimers()
    })

    it('holds the countdown while the tab is in the background', async () => {
        vi.useFakeTimers()
        const { wrapper } = await withMessages(['success', 'Added to cart'])
        const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

        vi.advanceTimersByTime(10_000)
        document.dispatchEvent(new Event('visibilitychange'))
        vi.advanceTimersByTime(60_000)
        await nextTick()
        expect(wrapper.find('[role="alert"]').exists()).toBe(true)

        hidden.mockReturnValue(false)
        document.dispatchEvent(new Event('visibilitychange'))
        vi.advanceTimersByTime(20_000)
        await nextTick()
        expect(wrapper.find('[role="alert"]').exists()).toBe(false)
        hidden.mockRestore()
        vi.useRealTimers()
    })

    describe('swipe to close', () => {
        const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
        beforeEach(() =>
            Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 300 })
        )
        afterEach(() => {
            if (width) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width)
            vi.useRealTimers()
        })

        const drag = async (
            wrapper: Awaited<ReturnType<typeof withMessages>>['wrapper'],
            dx: number,
            pointerType = 'touch'
        ) => {
            const alert = wrapper.find('[role="alert"]')
            await alert.trigger('pointerdown', { pointerType, clientX: 0 })
            await alert.trigger('pointermove', { pointerType, clientX: dx })
            await alert.trigger('pointerup', { pointerType, clientX: dx })
        }

        it('closes a message swiped past a third of its width', async () => {
            vi.useFakeTimers()
            const { wrapper } = await withMessages(['error', 'Out of stock'])

            await drag(wrapper, 150)
            vi.advanceTimersByTime(200)
            await nextTick()

            expect(wrapper.find('[role="alert"]').exists()).toBe(false)
        })

        it('slides a short swipe back and lets the countdown run on', async () => {
            vi.useFakeTimers()
            const { wrapper } = await withMessages(['success', 'Added to cart'])

            await drag(wrapper, 20)
            vi.advanceTimersByTime(1_000)
            await nextTick()
            expect(wrapper.find('[role="alert"]').exists()).toBe(true)
            expect(wrapper.find('[role="alert"]').attributes('style') ?? '').not.toContain('translateX')

            vi.advanceTimersByTime(14_000)
            await nextTick()
            expect(wrapper.find('[role="alert"]').exists()).toBe(false)
        })

        it('leaves a mouse drag to text selection', async () => {
            vi.useFakeTimers()
            const { wrapper } = await withMessages(['error', 'Out of stock'])

            await drag(wrapper, 150, 'mouse')
            vi.advanceTimersByTime(200)
            await nextTick()

            expect(wrapper.find('[role="alert"]').exists()).toBe(true)
        })
    })
})
