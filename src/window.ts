import { Responder } from './responder';
import type { View } from './view/view';
import { Yue } from './yue';
import { MenuBar } from './menu';

export interface WindowOptions {
    frame?: boolean;
    transparent?: boolean;
    /** macOS only; ignored for framed windows. */
    showTrafficLights?: boolean;
}

export class Window {
    readonly handle: number;
    readonly responder: Responder;
    private readonly yue: Yue;

    constructor(yue: Yue = Yue.default, optionsOrHandle?: WindowOptions | number) {
        this.yue = yue;
        const existingHandle = typeof optionsOrHandle === 'number' ? optionsOrHandle : undefined;
        const options = typeof optionsOrHandle === 'number' ? {} : optionsOrHandle ?? {};
        if ((options.frame !== undefined && typeof options.frame !== 'boolean') ||
            (options.transparent !== undefined && typeof options.transparent !== 'boolean') ||
            (options.showTrafficLights !== undefined && typeof options.showTrafficLights !== 'boolean')) {
            throw new TypeError('Window options must be booleans.');
        }
        if (options.transparent && options.frame !== false) {
            throw new Error('Transparent windows must be frameless.');
        }
        this.yue.ensureGuiRuntime();

        if (existingHandle !== undefined && (!Number.isSafeInteger(existingHandle) || existingHandle < 1)) {
            throw new RangeError('Window handle must be a positive integer.');
        }
        const handle = existingHandle === undefined ? this.yue.eval(`
            local runtime = _G.__quickjs_yue
            runtime.next_window_handle = runtime.next_window_handle + 1
            local handle = runtime.next_window_handle
            local window = runtime.gui.Window.create({
                ${options.frame === undefined ? '' : `frame = ${options.frame},`}
                ${options.transparent === undefined ? '' : `transparent = ${options.transparent},`}
                ${options.showTrafficLights === undefined ? '' : `showtrafficlights = ${options.showTrafficLights},`}
            })
            runtime.windows[handle] = window
            window.onclose = function()
                runtime.windows[handle] = nil
                if runtime.retire_event_owner then
                    runtime.retire_event_owner('window:' .. handle)
                end
                if next(runtime.windows) == nil then
                    runtime.event_loop_quit = true
                    runtime.gui.MessageLoop.quit()
                end
            end
            return handle
        `) : this.yue.eval(`
            assert(_G.__quickjs_yue.windows[${existingHandle}], 'Window is no longer available')
            return ${existingHandle}
        `);

        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Window creation returned an invalid handle.');
        }
        this.handle = handle;
        this.responder = new Responder(this.yue, `_G.__quickjs_yue.windows[${handle}]`, `window:${handle}`);
    }

    getRuntime(): Yue {
        return this.yue;
    }

    center(): void {
        this.call('window:center()');
    }

    activate(): void {
        this.call('window:activate()');
    }

    close(): void {
        this.call('window:close()');
    }

    setTitle(title: string): void {
        this.call(`window:settitle(${Yue.toLuaStringLiteral(title)})`);
    }

    setContentSize(width: number, height: number): void {
        const luaWidth = Window.luaNumber(width, 'width');
        const luaHeight = Window.luaNumber(height, 'height');
        this.call(`window:setcontentsize({ width = ${luaWidth}, height = ${luaHeight} })`);
    }

    setContentView(view: View): void {
        if (view.getRuntime() !== this.yue) throw new Error('[Yue] Window and view belong to different runtimes.');
        this.call(`window:setcontentview(assert(_G.__quickjs_yue.views[${view.handle}], 'View is no longer available'))`);
    }

    setVisible(visible: boolean): void {
        this.call(`window:setvisible(${visible})`);
    }

    /** Windows and Linux only. */
    setMenuBar(menu: MenuBar): void {
        if (menu.menuBase.getRuntime() !== this.yue) throw new Error('[Yue] Window and menu belong to different runtimes.');
        this.call(`
            local runtime = _G.__quickjs_yue
            local menu = assert(${menu.menuBase.expression()}, 'Menu is no longer available')
            local old = window:getmenubar()
            if old == menu then return end
            local owner = runtime.window_menu_owners[menu]
            assert(not owner, 'MenuBar already belongs to a window')
            window:setmenubar(menu)
            if old then runtime.window_menu_owners[old] = nil end
            runtime.window_menu_owners[menu] = window
        `);
    }

    /** Windows and Linux only. Returns an independent wrapper or null. */
    getMenuBar(): MenuBar | null {
        const exists = this.yue.eval(`
            local window = assert(_G.__quickjs_yue.windows[${this.handle}], 'Window is no longer available')
            return window:getmenubar() ~= nil
        `);
        if (typeof exists !== 'boolean') throw new Error('[Yue] Invalid window menu state.');
        return exists ? MenuBar.fromExpression(`_G.__quickjs_yue.windows[${this.handle}]:getmenubar()`, this.yue) : null;
    }

    /** Windows and Linux only. */
    setMenuBarVisible(visible: boolean): void {
        if (typeof visible !== 'boolean') throw new TypeError('Menu bar visibility must be boolean.');
        this.call(`window:setmenubarvisible(${visible})`);
    }

    private static luaNumber(value: number, name: string): string {
        if (!Number.isFinite(value) || value <= 0) {
            throw new RangeError(`${name} must be a finite positive number.`);
        }
        return String(value);
    }

    private call(statement: string): void {
        this.yue.eval(`
            local window = assert(
                _G.__quickjs_yue.windows[${this.handle}],
                'Window is no longer available'
            )
            ${statement}
        `);
    }
}
