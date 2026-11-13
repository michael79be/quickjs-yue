/// <reference types="quickjs-native" />

import { Lua } from 'quickjs-lua';
import * as os from 'os';

interface LuaRuntime {
    eval(code: string): string | number | boolean | null;
    destroy(): void;
}

export interface YueOptions {
    yueModulePaths?: string;
}

export class Yue {
    private static defaultInstance: Yue | undefined;
    private readonly lua: LuaRuntime;

    constructor(options: YueOptions = {}) {
        this.lua = new Lua();
        if (options.yueModulePaths !== undefined) {
            this.lua.eval(`package.cpath = ${Yue.toLuaStringLiteral(options.yueModulePaths)} .. ';' .. package.cpath`);
        } else {
            this.lua.eval(Yue.createYueModuleLoader(Yue.findYueModuleFiles()));
        }
    }

    static get default(): Yue {
        if (!Yue.defaultInstance) {
            Yue.defaultInstance = new Yue();
        }
        return Yue.defaultInstance;
    }

    static toLuaStringLiteral(value: string): string {
        let result = "'";
        for (const character of value) {
            switch (character) {
                case '\\':
                    result += '\\\\';
                    break;
                case "'":
                    result += "\\'";
                    break;
                case '\n':
                    result += '\\n';
                    break;
                case '\r':
                    result += '\\r';
                    break;
                case '\t':
                    result += '\\t';
                    break;
                default: {
                    const code = character.charCodeAt(0);
                    result += code < 32 || code === 127
                        ? `\\${code.toString().padStart(3, '0')}`
                        : character;
                }
            }
        }
        return `${result}'`;
    }

    eval(code: string): string | number | boolean | null {
        return this.lua.eval(code);
    }

    runFile(filename: string): string | number | boolean | null {
        return this.lua.eval(`dofile(${Yue.toLuaStringLiteral(filename)})`);
    }

    destroy(): void {
        if (Yue.defaultInstance === this) {
            Yue.defaultInstance = undefined;
        }
        this.lua.destroy();
    }

    private static findYueModuleFiles(): string[] {
        const platformDirectory = Yue.getPlatformDirectory();
        const extension = platformDirectory === 'windows' ? 'dll' : 'so';
        const architectures = Yue.getPlatformArchitectures(platformDirectory);
        const [workingDirectory, cwdError] = os.getcwd();
        if (cwdError !== 0) {
            throw new Error(`Unable to get the current directory (error ${cwdError}).`);
        }

        const separator = os.platform === 'win32' ? '\\' : '/';
        const directories: string[] = [];
        const addAncestors = (directory: string, isFile: boolean): void => {
            const parts = directory.split(/[\\/]/);
            if (isFile) {
                parts.pop();
            }
            while (parts.length > 0) {
                directories.push(parts.join(separator) || separator);
                parts.pop();
            }
        };

        addAncestors(workingDirectory, false);
        if (typeof scriptArgs[0] === 'string' && scriptArgs[0] !== '') {
            const [executablePath, pathError] = os.realpath(scriptArgs[0]);
            if (pathError === 0) {
                addAncestors(executablePath, true);
            }
        }

        const paths = new Set<string>();
        for (const directory of directories) {
            const basePath = directory.endsWith(separator) ? directory : `${directory}${separator}`;
            for (const architecture of architectures) {
                paths.add(`${basePath}${platformDirectory}${separator}${architecture}${separator}yue${separator}gui.${extension}`);
                paths.add(`${basePath}release${separator}${platformDirectory}${separator}${architecture}${separator}yue${separator}gui.${extension}`);
                paths.add(`${basePath}node_modules${separator}quickjs-yue${separator}release${separator}${platformDirectory}${separator}${architecture}${separator}yue${separator}gui.${extension}`);
            }
        }
        return [...paths];
    }

    private static getPlatformDirectory(): string {
        switch (os.platform) {
            case 'darwin':
                return 'macos';
            case 'linux':
                return 'linux';
            case 'win32':
                return 'windows';
            default:
                throw new Error(`Yue is not supported on ${os.platform}.`);
        }
    }

    private static getPlatformArchitectures(platform: string): string[] {
        switch (platform) {
            case 'macos':
                return ['arm64', 'x64'];
            case 'linux':
            case 'windows':
                return ['x86', 'x64'];
            default:
                throw new Error(`Yue is not supported on ${os.platform}.`);
        }
    }

    private static createYueModuleLoader(paths: string[]): string {
        const luaPaths = `{${paths.map(Yue.toLuaStringLiteral).join(', ')}}`;
        return `
            package.preload['yue.gui'] = function(name)
                local errors = {}
                for _, path in ipairs(${luaPaths}) do
                    local loader, loadError = package.loadlib(path, 'luaopen_yue_gui')
                    if loader then
                        return loader(name)
                    end
                    errors[#errors + 1] = path .. ': ' .. tostring(loadError)
                end
                error(table.concat(errors, '\\n'), 2)
            end
        `;
    }
}

export class Window {
    readonly handle: number;
    private readonly yue: Yue;

    constructor(yue: Yue = Yue.default) {
        this.yue = yue;
        Window.ensureGuiRuntime(this.yue);

        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            runtime.next_window_handle = runtime.next_window_handle + 1
            local handle = runtime.next_window_handle
            local window = runtime.gui.Window.create({})
            runtime.windows[handle] = window
            window.onclose = function()
                runtime.windows[handle] = nil
                if next(runtime.windows) == nil then
                    runtime.gui.MessageLoop.quit()
                end
            end
            return handle
        `);

        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Window creation returned an invalid handle.');
        }
        this.handle = handle;
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

    setVisible(visible: boolean): void {
        this.call(`window:setvisible(${visible})`);
    }

    private static ensureGuiRuntime(yue: Yue): void {
        yue.eval(`
            if not _G.__quickjs_yue then
                _G.__quickjs_yue = {
                    gui = require('yue.gui'),
                    windows = {},
                    next_window_handle = 0
                }
            end
        `);
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

export class MessageLoop {
    static run(yue: Yue = Yue.default): void {
        yue.eval(`require('yue.gui').MessageLoop.run()`);
    }

    static quit(yue: Yue = Yue.default): void {
        yue.eval(`require('yue.gui').MessageLoop.quit()`);
    }
}
