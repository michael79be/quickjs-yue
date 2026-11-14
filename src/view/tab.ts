import * as os from 'os';
import { View } from './view';
import { Yue } from '../yue';

export class Tab {
    readonly handle: number;
    readonly view: View;
    private readonly yue: Yue;
    private readonly disconnectors: Array<() => void> = [];

    constructor(yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local tab = assert(runtime.gui.Tab.create(), 'Tab could not be created')
            runtime.next_tab_handle = runtime.next_tab_handle + 1
            runtime.tabs[runtime.next_tab_handle] = tab
            return runtime.next_tab_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Tab creation returned an invalid handle.');
        }
        this.handle = handle;
        try {
            this.view = new View(this.expression(), this.yue);
        } catch (error) {
            this.yue.eval(`_G.__quickjs_yue.tabs[${handle}] = nil`);
            throw error;
        }
    }

    static create(yue: Yue = Yue.default): Tab {
        return new Tab(yue);
    }

    on(event: 'selectedPageChange', handler: () => void): () => void {
        if (event !== 'selectedPageChange' || typeof handler !== 'function') {
            throw new TypeError('[Yue] Invalid Tab event or handler.');
        }
        const disconnectSignal = this.yue.getEventBridge().connect(
            `tab:${this.handle}`, this.expression(), 'onselectedpagechange', 'capture', (fields) => {
                if (fields.length !== 0) throw new Error('[Yue] Invalid Tab event.');
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

    addPage(title: string, view: View): void {
        if (typeof title !== 'string' || title.includes('\0')) {
            throw new RangeError('Tab title must be a string without NUL.');
        }
        this.checkRuntime(view);
        this.call(`
            local runtime = _G.__quickjs_yue
            local page = assert(runtime.views[${view.handle}], 'View is no longer available')
            assert(not page:getparent(), 'View already has a parent')
            assert(not page:getwindow(), 'View already belongs to a window')
            local ancestor = tab
            while ancestor do
                assert(ancestor ~= page, 'Cannot add an ancestor as a page')
                ancestor = ancestor:getparent()
            end
            tab:addpage(${Yue.toLuaStringLiteral(title)}, page)
            runtime.view_parent_owners[page] = tab
        `);
    }

    removePage(view: View): void {
        this.checkRuntime(view);
        const windowsGuard = os.platform === 'win32' ? `
            local count = tab:pagecount()
            local selected = tab:getselectedpageindex()
            assert(selected >= 1 and selected <= count, 'Tab has an invalid Windows selection')
            local index
            for i = 1, count do
                if tab:pageat(i) == page then index = i; break end
            end
            assert(index, 'View is not a page of this Tab')
            assert(index > selected or (index == selected and index == count),
                'Cannot safely remove this page on Windows with Yue 0.15.6')
        ` : '';
        const windowsReselect = os.platform === 'win32' ? `
            if index == selected and count > 1 then
                assert(tab:getselectedpage(), 'Tab has no selected page'):setvisible(true)
            end
        ` : '';
        this.call(`
            local runtime = _G.__quickjs_yue
            local page = assert(runtime.views[${view.handle}], 'View is no longer available')
            assert(page:getparent() == tab, 'View is not a page of this Tab')
            ${windowsGuard}
            tab:removePage(page)
            ${windowsReselect}
            if runtime.view_parent_owners[page] == tab then
                runtime.view_parent_owners[page] = nil
            end
        `);
    }

    pageCount(): number {
        const count = this.call('return tab:pagecount()');
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
            throw new Error('[Yue] Invalid Tab page count.');
        }
        return count;
    }

    /** `index` is zero-based; returns a new wrapper or null when out of range. */
    pageAt(index: number): View | null {
        Tab.index(index);
        if (index >= this.pageCount()) return null;
        return new View(`assert(${this.expression()}, 'Tab is no longer available'):pageat(${index + 1})`, this.yue);
    }

    /** `index` is zero-based. */
    selectPageAt(index: number): void {
        Tab.index(index);
        this.call(`
            assert(${index} < tab:pagecount(), 'Tab page index is out of range')
            tab:selectpageat(${index + 1})
        `);
    }

    /** Returns -1 if no page is selected. */
    getSelectedPageIndex(): number {
        const index = this.call(`
            local index = tab:getselectedpageindex()
            assert(index == -1 or (index >= 1 and index <= tab:pagecount()), 'Tab has an invalid selection')
            return index
        `);
        if (typeof index !== 'number' || !Number.isSafeInteger(index) || (index !== -1 && index < 1)) {
            throw new Error('[Yue] Invalid Tab selection index.');
        }
        return index === -1 ? -1 : index - 1;
    }

    /** Returns a new view wrapper, or null if no page is selected. */
    getSelectedPage(): View | null {
        const index = this.getSelectedPageIndex();
        return index === -1 ? null : this.pageAt(index);
    }

    dispose(): void {
        while (this.disconnectors.length > 0) this.disconnectors[0]();
        this.view.dispose();
        this.yue.eval(`_G.__quickjs_yue.tabs[${this.handle}] = nil`);
    }

    private checkRuntime(view: View): void {
        if (view.getRuntime() !== this.yue) throw new Error('[Yue] Tab and view belong to different runtimes.');
    }

    private static index(index: number): void {
        if (!Number.isSafeInteger(index) || index < 0 || index >= 2147483647) {
            throw new RangeError('Tab page index must be a non-negative integer.');
        }
    }

    private expression(): string {
        return `_G.__quickjs_yue.tabs[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local tab = assert(${this.expression()}, 'Tab is no longer available')
            ${statement}
        `);
    }
}
