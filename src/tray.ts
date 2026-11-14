import { Image } from './image';
import type { Rect } from './painter';
import { Yue } from './yue';
import { Menu } from './menu';

/**
 * A tray item displayed in the system notification area. On Linux it is an app indicator that
 * only shows with a menu attached, and on Windows it must be removed on exit, otherwise a
 * zombie icon is left behind. Click events are not supported yet.
 */
export class Tray {
    readonly handle: number;
    private readonly yue: Yue;

    /** Creates a tray item with an icon, or with only a title (macOS only). */
    constructor(icon: Image | string, yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();

        const creation = typeof icon === 'string'
            ? `runtime.gui.Tray.createwithtitle(${Yue.toLuaStringLiteral(icon)})`
            : `runtime.gui.Tray.createwithimage(runtime.images[${icon.handle}])`;
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            runtime.next_tray_handle = runtime.next_tray_handle + 1
            runtime.trays[runtime.next_tray_handle] = ${creation}
            return runtime.next_tray_handle
        `);

        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Tray creation returned an invalid handle.');
        }
        this.handle = handle;
    }

    static createWithImage(icon: Image, yue: Yue = Yue.default): Tray {
        return new Tray(icon, yue);
    }

    /** macOS only. */
    static createWithTitle(title: string, yue: Yue = Yue.default): Tray {
        return new Tray(title, yue);
    }

    /** Removes the tray item. The instance cannot be used afterwards. */
    remove(): void {
        this.call(`
            tray:remove()
            local runtime = _G.__quickjs_yue
            local menu = runtime.tray_menus[tray]
            if menu then runtime.tray_menu_owners[menu] = nil end
            runtime.tray_menus[tray] = nil
        `);
        this.yue.eval(`_G.__quickjs_yue.trays[${this.handle}] = nil`);
    }

    /** macOS and Windows only. */
    getBounds(): Rect {
        const [x, y, width, height] = ['x', 'y', 'width', 'height'].map(
            (field) => Number(this.call(`return tray:getbounds().${field}`))
        );
        return { x, y, width, height };
    }

    /** macOS and Linux only. */
    setTitle(title: string): void {
        this.call(`tray:settitle(${Yue.toLuaStringLiteral(title)})`);
    }

    setImage(icon: Image): void {
        this.call(`tray:setimage(_G.__quickjs_yue.images[${icon.handle}])`);
    }

    /** macOS only. */
    setPressedImage(image: Image): void {
        this.call(`tray:setpressedimage(_G.__quickjs_yue.images[${image.handle}])`);
    }

    setMenu(menu: Menu): void {
        if (menu.menuBase.getRuntime() !== this.yue) throw new Error('[Yue] Tray and menu belong to different runtimes.');
        this.call(`
            local runtime = _G.__quickjs_yue
            local menu = assert(${menu.menuBase.expression()}, 'Menu is no longer available')
            local old = runtime.tray_menus[tray]
            if old == menu then return end
            assert(not runtime.menu_parents[menu] and not runtime.tray_menu_owners[menu],
                'Menu already belongs to another owner')
            tray:setmenu(menu)
            if old then runtime.tray_menu_owners[old] = nil end
            runtime.tray_menus[tray] = menu
            runtime.tray_menu_owners[menu] = tray
        `);
    }

    /** Returns an independent wrapper or null. */
    getMenu(): Menu | null {
        const exists = this.call('return _G.__quickjs_yue.tray_menus[tray] ~= nil');
        if (typeof exists !== 'boolean') throw new Error('[Yue] Invalid tray menu state.');
        return exists ? Menu.fromExpression(`_G.__quickjs_yue.tray_menus[_G.__quickjs_yue.trays[${this.handle}]]`, this.yue) : null;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local tray = assert(_G.__quickjs_yue.trays[${this.handle}], 'Tray is no longer available')
            ${statement}
        `);
    }
}
