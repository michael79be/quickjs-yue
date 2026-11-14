import { Yue } from './yue';
import { MenuBar } from './menu';

export type ActivationPolicy = 'regular' | 'accessory' | 'prohibited';

export interface ShortcutOptions {
    arguments?: string;
    description?: string;
    workingDir?: string;
}

/** Application-wide APIs. Methods marked with a platform only exist on that platform. */
export class App {
    /** macOS only. */
    static setApplicationMenu(menu: MenuBar, yue: Yue = Yue.default): void {
        if (menu.menuBase.getRuntime() !== yue) throw new Error('[Yue] App and menu belong to different runtimes.');
        yue.ensureGuiRuntime();
        yue.eval(`
            local runtime = _G.__quickjs_yue
            local menu = assert(${menu.menuBase.expression()}, 'Menu is no longer available')
            runtime.gui.app:setapplicationmenu(menu)
            runtime.application_menu = menu
        `);
    }

    /** macOS only. Returns an independent wrapper or null. */
    static getApplicationMenu(yue: Yue = Yue.default): MenuBar | null {
        yue.ensureGuiRuntime();
        const exists = yue.eval(`
            local runtime = _G.__quickjs_yue
            assert(runtime.gui.app.setapplicationmenu, 'Application menus are available only on macOS')
            return runtime.application_menu ~= nil
        `);
        if (typeof exists !== 'boolean') throw new Error('[Yue] Invalid application menu state.');
        return exists ? MenuBar.fromExpression('_G.__quickjs_yue.application_menu', yue) : null;
    }

    static setName(name: string, yue: Yue = Yue.default): void {
        App.call(yue, `app:setname(${Yue.toLuaStringLiteral(name)})`);
    }

    static getName(yue: Yue = Yue.default): string {
        return App.string(yue, 'return app:getname()');
    }

    /** Windows and Linux only. */
    static setID(id: string, yue: Yue = Yue.default): void {
        App.call(yue, `app:setid(${Yue.toLuaStringLiteral(id)})`);
    }

    static getID(yue: Yue = Yue.default): string {
        return App.string(yue, 'return app:getid()');
    }

    /** macOS only. */
    static setDockBadgeLabel(label: string, yue: Yue = Yue.default): void {
        App.call(yue, `app:setdockbadgelabel(${Yue.toLuaStringLiteral(label)})`);
    }

    /** macOS only. */
    static getDockBadgeLabel(yue: Yue = Yue.default): string {
        return App.string(yue, 'return app:getdockbadgelabel()');
    }

    /** Windows only. */
    static isRunningAsUWP(yue: Yue = Yue.default): boolean {
        return App.boolean(yue, 'return app:isrunningasuwp()');
    }

    /** Windows only. */
    static createStartMenuShortcut(options: ShortcutOptions = {}, yue: Yue = Yue.default): boolean {
        const fields: string[] = [];
        if (options.arguments !== undefined) {
            fields.push(`arguments = ${Yue.toLuaStringLiteral(options.arguments)}`);
        }
        if (options.description !== undefined) {
            fields.push(`description = ${Yue.toLuaStringLiteral(options.description)}`);
        }
        if (options.workingDir !== undefined) {
            fields.push(`working_dir = ${Yue.toLuaStringLiteral(options.workingDir)}`);
        }
        return App.boolean(yue, `return app:createstartmenushortcut({ ${fields.join(', ')} })`);
    }

    /** Windows only. */
    static getStartMenuShortcutPath(yue: Yue = Yue.default): string {
        return App.string(yue, 'return app:getstartmenushortcutpath()');
    }

    /** macOS only. */
    static activate(force = false, yue: Yue = Yue.default): void {
        App.call(yue, `app:activate(${force})`);
    }

    /** macOS only. */
    static deactivate(yue: Yue = Yue.default): void {
        App.call(yue, 'app:deactivate()');
    }

    /** macOS only. */
    static isActive(yue: Yue = Yue.default): boolean {
        return App.boolean(yue, 'return app:isactive()');
    }

    /** macOS only. */
    static setActivationPolicy(policy: ActivationPolicy, yue: Yue = Yue.default): void {
        App.call(yue, `app:setactivationpolicy(${Yue.toLuaStringLiteral(policy)})`);
    }

    /** macOS only. */
    static getActivationPolicy(yue: Yue = Yue.default): ActivationPolicy {
        return App.string(yue, 'return app:getactivationpolicy()') as ActivationPolicy;
    }

    private static run(yue: Yue, statement: string): string | number | boolean | null {
        return yue.eval(`
            local app = require('yue.gui').app
            ${statement}
        `);
    }

    private static call(yue: Yue, statement: string): void {
        App.run(yue, statement);
    }

    private static string(yue: Yue, statement: string): string {
        const value = App.run(yue, statement);
        if (typeof value !== 'string') {
            throw new Error('[Yue] Expected a string result.');
        }
        return value;
    }

    private static boolean(yue: Yue, statement: string): boolean {
        const value = App.run(yue, statement);
        if (typeof value !== 'boolean') {
            throw new Error('[Yue] Expected a boolean result.');
        }
        return value;
    }
}
