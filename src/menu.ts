import * as os from 'os';
import { Image } from './image';
import type { Point } from './painter';
import { Yue } from './yue';

export class MenuBase {
    readonly handle: number;
    private readonly yue: Yue;

    constructor(luaExpression: string, yue: Yue = Yue.default, items: MenuItem[] = []) {
        this.yue = yue;
        if (!Array.isArray(items)) throw new TypeError('Menu items must be an array.');
        for (const item of items) {
            if (item.getRuntime() !== yue) throw new Error('[Yue] Menu and item belong to different runtimes.');
        }
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local items = { ${items.map(item => `(assert(runtime.menu_items[${item.handle}], 'MenuItem is no longer available'))`).join(', ')} }
            local seen = {}
            for _, item in ipairs(items) do
                assert(not seen[item] and not runtime.menu_item_parents[item], 'MenuItem already belongs to a menu')
                seen[item] = true
            end
            local menu = assert(${luaExpression}, 'Menu could not be created')
            for _, item in ipairs(items) do
                menu:append(item)
                ${os.platform === 'win32' ? "if runtime.menu_item_types[item] ~= 'separator' then item:setenabled(item:isenabled()) end" : ''}
                runtime.menu_item_parents[item] = menu
            end
            runtime.next_menu_handle = runtime.next_menu_handle + 1
            runtime.menus[runtime.next_menu_handle] = menu
            return runtime.next_menu_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Menu creation returned an invalid handle.');
        }
        this.handle = handle;
    }

    getRuntime(): Yue {
        return this.yue;
    }

    append(item: MenuItem): void {
        this.insert(item, this.itemCount());
    }

    /** `index` is zero-based and may equal the item count. */
    insert(item: MenuItem, index: number): void {
        MenuBase.index(index);
        if (item.getRuntime() !== this.yue) throw new Error('[Yue] Menu and item belong to different runtimes.');
        this.call(`
            local runtime = _G.__quickjs_yue
            local item = assert(runtime.menu_items[${item.handle}], 'MenuItem is no longer available')
            assert(${index} <= menu:itemcount(), 'Menu index is out of range')
            assert(not runtime.menu_item_parents[item], 'MenuItem already belongs to a menu')
            local ancestor = menu
            while ancestor do
                local parent = runtime.menu_parents[ancestor]
                assert(parent ~= item, 'Cannot create a menu cycle')
                ancestor = parent and runtime.menu_item_parents[parent]
            end
            menu:insert(item, ${index + 1})
            ${os.platform === 'win32' ? "if runtime.menu_item_types[item] ~= 'separator' then item:setenabled(item:isenabled()) end" : ''}
            runtime.menu_item_parents[item] = menu
        `);
    }

    remove(item: MenuItem): void {
        if (item.getRuntime() !== this.yue) throw new Error('[Yue] Menu and item belong to different runtimes.');
        this.call(`
            local runtime = _G.__quickjs_yue
            local item = assert(runtime.menu_items[${item.handle}], 'MenuItem is no longer available')
            assert(runtime.menu_item_parents[item] == menu, 'MenuItem does not belong to this menu')
            menu:remove(item)
            runtime.menu_item_parents[item] = nil
        `);
    }

    itemCount(): number {
        const count = this.call('return menu:itemcount()');
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
            throw new Error('[Yue] Invalid menu item count.');
        }
        return count;
    }

    /** Returns an independent wrapper, or null when the zero-based index is out of range. */
    itemAt(index: number): MenuItem | null {
        MenuBase.index(index);
        if (index >= this.itemCount()) return null;
        return MenuItem.fromExpression(`assert(${this.expression()}, 'Menu is no longer available'):itemat(${index + 1})`, this.yue);
    }

    dispose(): void {
        this.yue.eval(`_G.__quickjs_yue.menus[${this.handle}] = nil`);
    }

    expression(): string {
        return `_G.__quickjs_yue.menus[${this.handle}]`;
    }

    call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local menu = assert(${this.expression()}, 'Menu is no longer available')
            ${statement}
        `);
    }

    private static index(index: number): void {
        if (!Number.isSafeInteger(index) || index < 0 || index >= 2147483647) {
            throw new RangeError('Menu index must be a non-negative integer.');
        }
    }
}


export type MenuItemType = 'label' | 'checkbox' | 'radio' | 'separator' | 'submenu';
export type MenuItemRole = 'copy' | 'cut' | 'paste' | 'select-all' | 'undo' | 'redo' |
    'minimize' | 'maximize' | 'close-window' | 'about' | 'hide' | 'hide-others' |
    'unhide' | 'help' | 'window' | 'services';

export interface MenuItemOptions {
    type?: MenuItemType;
    role?: MenuItemRole;
    label?: string;
    checked?: boolean;
    enabled?: boolean;
    visible?: boolean;
    accelerator?: string;
    image?: Image;
    submenu?: Menu;
}

const types: MenuItemType[] = ['label', 'checkbox', 'radio', 'separator', 'submenu'];
const roles: MenuItemRole[] = ['copy', 'cut', 'paste', 'select-all', 'undo', 'redo',
    'minimize', 'maximize', 'close-window', 'about', 'hide', 'hide-others', 'unhide',
    'help', 'window', 'services'];
const macRoles: MenuItemRole[] = ['about', 'hide', 'hide-others', 'unhide', 'help', 'window', 'services'];

export class MenuItem {
    readonly handle: number;
    private readonly yue: Yue;
    private readonly disconnectors: Array<() => void> = [];

    constructor(options: MenuItemType | MenuItemOptions = 'label', yue: Yue = Yue.default, luaExpression?: string) {
        this.yue = yue;
        const settings: MenuItemOptions = typeof options === 'string' ? { type: options } : options;
        if (!settings || typeof settings !== 'object') throw new TypeError('Invalid MenuItem options.');
        if (settings.type !== undefined && !types.includes(settings.type)) throw new RangeError('Invalid MenuItem type.');
        if (settings.role !== undefined && !roles.includes(settings.role)) throw new RangeError('Invalid MenuItem role.');
        if (settings.role && settings.type) throw new Error('MenuItem cannot specify both type and role.');
        if (settings.role && macRoles.includes(settings.role) && os.platform !== 'darwin') {
            throw new Error('This MenuItem role is available only on macOS.');
        }
        const type = settings.type ?? (settings.role
            ? (['help', 'window', 'services'].includes(settings.role) ? 'submenu' : 'label')
            : settings.submenu ? 'submenu' : settings.checked !== undefined ? 'checkbox' : 'label');
        if (settings.checked !== undefined && type !== 'checkbox' && type !== 'radio') {
            throw new Error('Only checkbox and radio items can be checked.');
        }
        if (settings.submenu && type !== 'submenu') throw new Error('Only submenu items can have a submenu.');
        for (const value of [settings.checked, settings.enabled, settings.visible]) {
            if (value !== undefined && typeof value !== 'boolean') throw new TypeError('MenuItem state must be boolean.');
        }
        if (settings.label !== undefined) MenuItem.text(settings.label);
        if (settings.accelerator !== undefined) MenuItem.text(settings.accelerator);
        if (settings.image && settings.image.getRuntime() !== yue) throw new Error('[Yue] MenuItem and image belong to different runtimes.');
        if (settings.submenu && settings.submenu.menuBase.getRuntime() !== yue) throw new Error('[Yue] MenuItem and submenu belong to different runtimes.');
        this.yue.ensureGuiRuntime();
        const creation = settings.role
            ? `runtime.gui.MenuItem.create({ role = ${Yue.toLuaStringLiteral(settings.role)} })`
            : `runtime.gui.MenuItem.create(${Yue.toLuaStringLiteral(type)})`;
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local item = assert(${luaExpression ?? creation}, 'MenuItem could not be created')
            ${luaExpression ? '' : `runtime.menu_item_types[item] = '${type}'`}
            runtime.next_menu_item_handle = runtime.next_menu_item_handle + 1
            runtime.menu_items[runtime.next_menu_item_handle] = item
            return runtime.next_menu_item_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] MenuItem creation returned an invalid handle.');
        }
        this.handle = handle;
        if (!luaExpression) {
            try {
                if (settings.label !== undefined) this.setLabel(settings.label);
                if (settings.checked !== undefined) this.setChecked(settings.checked);
                if (settings.enabled !== undefined) this.setEnabled(settings.enabled);
                if (settings.visible !== undefined) this.setVisible(settings.visible);
                if (settings.accelerator !== undefined) this.setAccelerator(settings.accelerator);
                if (settings.image !== undefined) this.setImage(settings.image);
                if (settings.submenu !== undefined) this.setSubmenu(settings.submenu);
            } catch (error) {
                this.dispose();
                throw error;
            }
        }
    }

    static create(options: MenuItemType | MenuItemOptions = 'label', yue: Yue = Yue.default): MenuItem {
        return new MenuItem(options, yue);
    }

    static fromExpression(expression: string, yue: Yue): MenuItem {
        return new MenuItem('label', yue, expression);
    }

    getRuntime(): Yue {
        return this.yue;
    }

    on(event: 'click', handler: () => void): () => void {
        if (event !== 'click' || typeof handler !== 'function') throw new TypeError('[Yue] Invalid MenuItem event or handler.');
        const disconnectSignal = this.yue.getEventBridge().connect(
            `menuItem:${this.handle}`, this.expression(), 'onclick', 'capture', (fields) => {
                if (fields.length !== 0) throw new Error('[Yue] Invalid MenuItem event.');
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

    click(): void {
        this.call('item:click()');
    }

    setLabel(label: string): void {
        this.call(`item:setlabel(${MenuItem.text(label)})`);
    }

    getLabel(): string {
        const value = this.call('return item:getlabel()');
        if (typeof value !== 'string') throw new Error('[Yue] Invalid MenuItem label.');
        return value;
    }

    setSubmenu(submenu: Menu): void {
        if (submenu.menuBase.getRuntime() !== this.yue) throw new Error('[Yue] MenuItem and submenu belong to different runtimes.');
        this.call(`
            local runtime = _G.__quickjs_yue
            local submenu = assert(${submenu.menuBase.expression()}, 'Menu is no longer available')
            assert(runtime.menu_item_types[item] == 'submenu', 'MenuItem is not a submenu')
            local old = runtime.menu_submenus[item]
            if old == submenu then return end
            assert(not runtime.menu_parents[submenu] and not runtime.tray_menu_owners[submenu],
                'Menu already belongs to another owner')
            local ancestor = runtime.menu_item_parents[item]
            while ancestor do
                assert(ancestor ~= submenu, 'Cannot create a menu cycle')
                local parent = runtime.menu_parents[ancestor]
                ancestor = parent and runtime.menu_item_parents[parent]
            end
            local parent = runtime.menu_item_parents[item]
            local index
            if parent then
                for i = 1, parent:itemcount() do
                    if parent:itemat(i) == item then index = i; break end
                end
                assert(index, 'MenuItem is missing from its parent')
                parent:remove(item)
            end
            item:setsubmenu(submenu)
            if old then runtime.menu_parents[old] = nil end
            runtime.menu_submenus[item] = submenu
            runtime.menu_parents[submenu] = item
            if parent then
                parent:insert(item, index)
                ${os.platform === 'win32' ? 'item:setenabled(item:isenabled())' : ''}
            end
        `);
    }

    getSubmenu(): Menu | null {
        const exists = this.call('return item:getsubmenu() ~= nil');
        if (typeof exists !== 'boolean') throw new Error('[Yue] Invalid submenu state.');
        return exists ? Menu.fromExpression(`assert(${this.expression()}, 'MenuItem is no longer available'):getsubmenu()`, this.yue) : null;
    }

    setChecked(checked: boolean): void {
        MenuItem.boolean(checked);
        this.call(`
            local kind = _G.__quickjs_yue.menu_item_types[item]
            assert(kind == 'checkbox' or kind == 'radio', 'MenuItem is not checkable')
            item:setchecked(${checked})
        `);
    }

    isChecked(): boolean {
        return this.booleanResult('return item:ischecked()');
    }

    setEnabled(enabled: boolean): void {
        MenuItem.boolean(enabled);
        this.call(`item:setenabled(${enabled})`);
    }

    isEnabled(): boolean {
        return this.booleanResult('return item:isenabled()');
    }

    setVisible(visible: boolean): void {
        MenuItem.boolean(visible);
        this.call(`item:setvisible(${visible})`);
    }

    isVisible(): boolean {
        return this.booleanResult('return item:isvisible()');
    }

    setAccelerator(accelerator: string): void {
        this.call(`item:setaccelerator(${MenuItem.text(accelerator)})`);
    }

    /** macOS and Windows only. */
    setImage(image: Image): void {
        if (image.getRuntime() !== this.yue) throw new Error('[Yue] MenuItem and image belong to different runtimes.');
        this.call(`item:setimage(assert(_G.__quickjs_yue.images[${image.handle}], 'Image is no longer available'))`);
    }

    /** macOS and Windows only. Returns an independent wrapper or null. */
    getImage(): Image | null {
        const exists = this.call('return item:getimage() ~= nil');
        if (typeof exists !== 'boolean') throw new Error('[Yue] Invalid MenuItem image state.');
        return exists ? new Image(`assert(${this.expression()}, 'MenuItem is no longer available'):getimage()`, this.yue) : null;
    }

    dispose(): void {
        while (this.disconnectors.length > 0) this.disconnectors[0]();
        this.yue.eval(`_G.__quickjs_yue.menu_items[${this.handle}] = nil`);
    }

    private static text(value: string): string {
        if (typeof value !== 'string' || value.includes('\0')) throw new RangeError('MenuItem text must be a string without NUL.');
        return Yue.toLuaStringLiteral(value);
    }

    private static boolean(value: boolean): void {
        if (typeof value !== 'boolean') throw new TypeError('MenuItem state must be boolean.');
    }

    private booleanResult(statement: string): boolean {
        const value = this.call(statement);
        if (typeof value !== 'boolean') throw new Error('[Yue] Invalid MenuItem state.');
        return value;
    }

    private expression(): string {
        return `_G.__quickjs_yue.menu_items[${this.handle}]`;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local item = assert(${this.expression()}, 'MenuItem is no longer available')
            ${statement}
        `);
    }
}


export class Menu {
    readonly menuBase: MenuBase;

    constructor(items: MenuItem[] = [], yue: Yue = Yue.default, luaExpression?: string) {
        this.menuBase = new MenuBase(luaExpression ?? '_G.__quickjs_yue.gui.Menu.create()', yue, items);
    }

    static create(items: MenuItem[] = [], yue: Yue = Yue.default): Menu {
        return new Menu(items, yue);
    }

    static fromExpression(expression: string, yue: Yue): Menu {
        return new Menu([], yue, expression);
    }

    popup(): void {
        this.menuBase.call('menu:popup()');
    }

    popupAt(point: Point): void {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) ||
            !Number.isFinite(Math.fround(point.x)) || !Number.isFinite(Math.fround(point.y))) {
            throw new RangeError('Menu position must contain finite coordinates.');
        }
        this.menuBase.call(`menu:popupat({ x = ${point.x}, y = ${point.y} })`);
    }

    dispose(): void {
        this.menuBase.dispose();
    }
}


export class MenuBar {
    readonly menuBase: MenuBase;

    constructor(items: MenuItem[] = [], yue: Yue = Yue.default, luaExpression?: string) {
        this.menuBase = new MenuBase(luaExpression ?? '_G.__quickjs_yue.gui.MenuBar.create()', yue, items);
    }

    static create(items: MenuItem[] = [], yue: Yue = Yue.default): MenuBar {
        return new MenuBar(items, yue);
    }

    static fromExpression(expression: string, yue: Yue): MenuBar {
        return new MenuBar([], yue, expression);
    }

    dispose(): void {
        this.menuBase.dispose();
    }
}
