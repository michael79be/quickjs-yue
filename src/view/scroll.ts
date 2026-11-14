import * as os from 'os';
import type { Size } from '../image';
import { View } from './view';
import { Yue } from '../yue';

export type ScrollPolicy = 'always' | 'never' | 'automatic';
export type ScrollElasticity = 'automatic' | 'none' | 'allowed';

export class Scroll {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;
    private readonly disconnectors: Array<() => void> = [];

    constructor(yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local scroll = assert(runtime.gui.Scroll.create(), 'Scroll could not be created')
            runtime.next_scroll_handle = runtime.next_scroll_handle + 1
            runtime.scrolls[runtime.next_scroll_handle] = scroll
            return runtime.next_scroll_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Scroll creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.scrolls[${handle}] = nil`);
            throw error;
        }
    }

    static create(yue: Yue = Yue.default): Scroll {
        return new Scroll(yue);
    }

    on(event: 'scroll', handler: () => void): () => void {
        if (event !== 'scroll' || typeof handler !== 'function') {
            throw new TypeError('[Yue] Invalid Scroll event or handler.');
        }
        const disconnectSignal = this.yue.getEventBridge().connect(
            `scroll:${this.handle}`, this.expression(), 'onscroll', 'capture', (fields) => {
                if (fields.length !== 0) throw new Error('[Yue] Invalid Scroll event.');
                handler();
            },
        );
        const disconnect = () => {
            disconnectSignal();
            const index = this.disconnectors.indexOf(disconnect);
            if (index !== -1) this.disconnectors.splice(index, 1);
        };
        this.disconnectors.push(disconnect);
        return disconnect;
    }

    setContentView(view: View): void {
        if (view.getRuntime() !== this.yue) throw new Error('[Yue] Scroll and view belong to different runtimes.');
        this.call(`
            local runtime = _G.__quickjs_yue
            local content = assert(runtime.views[${view.handle}], 'View is no longer available')
            local previous = scroll:getcontentview()
            if previous ~= content then
                assert(not content:getparent(), 'View already has a parent')
                assert(not content:getwindow(), 'View already belongs to a window')
                local ancestor = scroll
                while ancestor do
                    assert(ancestor ~= content, 'Cannot add an ancestor as scroll content')
                    ancestor = ancestor:getparent()
                end
                scroll:setcontentview(content)
                if runtime.view_parent_owners[previous] == scroll then
                    runtime.view_parent_owners[previous] = nil
                end
            end
            runtime.view_parent_owners[content] = scroll
        `);
    }

    /** Returns an independent wrapper for the current content view. */
    getContentView(): View {
        const view = new View(`assert(${this.expression()}, 'Scroll is no longer available'):getcontentview()`, this.yue);
        try {
            this.call(`
                _G.__quickjs_yue.view_parent_owners[assert(_G.__quickjs_yue.views[${view.handle}])] = scroll
            `);
        } catch (error) {
            view.dispose();
            throw error;
        }
        return view;
    }

    setContentSize(size: Size): void {
        if (!size) throw new TypeError('Scroll content size is required.');
        this.call(`scroll:setcontentsize({ width = ${Scroll.number(size.width)}, height = ${Scroll.number(size.height)} })`);
    }

    getContentSize(): Size {
        const [width, height] = this.numbers(`
            local size = scroll:getcontentsize()
            return tostring(size.width) .. ',' .. tostring(size.height)
        `);
        return { width, height };
    }

    setScrollPosition(horizontal: number, vertical: number): void {
        this.call(`scroll:setscrollposition(${Scroll.number(horizontal)}, ${Scroll.number(vertical)})`);
    }

    getScrollPosition(): [number, number] {
        return this.pair('scroll:getscrollposition()');
    }

    getMaximumScrollPosition(): [number, number] {
        return this.pair('scroll:getmaximumscrollposition()');
    }

    /** macOS and Linux only. */
    setOverlayScrollbar(overlay: boolean): void {
        Scroll.requireOverlay();
        if (typeof overlay !== 'boolean') throw new TypeError('Scroll overlay must be a boolean.');
        this.call(`scroll:setoverlayscrollbar(${overlay})`);
    }

    /** macOS and Linux only. */
    isOverlayScrollbar(): boolean {
        Scroll.requireOverlay();
        const overlay = this.call('return scroll:isoverlayscrollbar()');
        if (typeof overlay !== 'boolean') throw new Error('[Yue] Invalid Scroll overlay state.');
        return overlay;
    }

    setScrollbarPolicy(horizontal: ScrollPolicy, vertical: ScrollPolicy): void {
        Scroll.policy(horizontal);
        Scroll.policy(vertical);
        this.call(`scroll:setscrollbarpolicy(${Yue.toLuaStringLiteral(horizontal)}, ${Yue.toLuaStringLiteral(vertical)})`);
    }

    getScrollbarPolicy(): [ScrollPolicy, ScrollPolicy] {
        const values = this.strings('scroll:getscrollbarpolicy()');
        Scroll.policy(values[0]);
        Scroll.policy(values[1]);
        return [values[0], values[1]];
    }

    /** macOS only. */
    setScrollElasticity(horizontal: ScrollElasticity, vertical: ScrollElasticity): void {
        Scroll.requireMac();
        Scroll.elasticity(horizontal);
        Scroll.elasticity(vertical);
        this.call(`scroll:setscrollelasticity(${Yue.toLuaStringLiteral(horizontal)}, ${Yue.toLuaStringLiteral(vertical)})`);
    }

    /** macOS only. */
    getScrollElasticity(): [ScrollElasticity, ScrollElasticity] {
        Scroll.requireMac();
        const values = this.strings('scroll:getscrollelasticity()');
        Scroll.elasticity(values[0]);
        Scroll.elasticity(values[1]);
        return [values[0], values[1]];
    }

    dispose(): void {
        while (this.disconnectors.length > 0) this.disconnectors[0]();
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.scrolls[${this.handle}] = nil`);
    }

    private static number(value: number): number {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isFinite(Math.fround(value))) {
            throw new RangeError('Scroll dimensions and positions must be finite non-negative numbers.');
        }
        return value;
    }

    private static policy(value: string): asserts value is ScrollPolicy {
        if (value !== 'always' && value !== 'never' && value !== 'automatic') {
            throw new TypeError('[Yue] Invalid Scroll policy.');
        }
    }

    private static elasticity(value: string): asserts value is ScrollElasticity {
        if (value !== 'automatic' && value !== 'none' && value !== 'allowed') {
            throw new TypeError('[Yue] Invalid Scroll elasticity.');
        }
    }

    private static requireOverlay(): void {
        if (os.platform === 'win32') throw new Error('[Yue] Overlay scrollbars are not supported on Windows.');
    }

    private static requireMac(): void {
        if (os.platform !== 'darwin') throw new Error('[Yue] Scroll elasticity is only available on macOS.');
    }

    private pair(expression: string): [number, number] {
        return this.numbers(`
            local horizontal, vertical = ${expression}
            return tostring(horizontal) .. ',' .. tostring(vertical)
        `);
    }

    private numbers(statement: string): [number, number] {
        const result = this.call(statement);
        if (typeof result !== 'string') throw new Error('[Yue] Invalid Scroll dimensions.');
        const parts = result.split(',');
        if (parts.length !== 2 || parts.some((part) => part === '' || !Number.isFinite(Number(part)))) {
            throw new Error('[Yue] Invalid Scroll dimensions.');
        }
        return [Number(parts[0]), Number(parts[1])];
    }

    private strings(expression: string): [string, string] {
        const result = this.call(`
            local horizontal, vertical = ${expression}
            return horizontal .. ',' .. vertical
        `);
        if (typeof result !== 'string') throw new Error('[Yue] Invalid Scroll settings.');
        const parts = result.split(',');
        if (parts.length !== 2) throw new Error('[Yue] Invalid Scroll settings.');
        return [parts[0], parts[1]];
    }

    private expression(): string {
        return `_G.__quickjs_yue.scrolls[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local scroll = assert(${this.expression()}, 'Scroll is no longer available')
            ${statement}
        `);
    }
}
