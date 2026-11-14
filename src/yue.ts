/// <reference types="quickjs-native" />

import { Lua } from 'quickjs-lua';
import * as os from 'os';
import { EventBridge } from './eventbridge';

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
    private eventBridge: EventBridge | undefined;

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

    getEventBridge(): EventBridge {
        if (!this.eventBridge) {
            this.eventBridge = new EventBridge(this, Yue.toLuaStringLiteral);
        }
        return this.eventBridge;
    }

    runMessageLoop(): void {
        if (this.eventBridge) {
            this.eventBridge.run();
        } else {
            this.eval("require('yue.gui').MessageLoop.run()");
        }
    }

    quitMessageLoop(): void {
        if (!this.eventBridge || !this.eventBridge.quit()) {
            this.eval("require('yue.gui').MessageLoop.quit()");
        }
    }

    /** Creates the Lua-side registry that maps numeric handles to native objects. */
    ensureGuiRuntime(): void {
        this.eval(`
            if not _G.__quickjs_yue then
                _G.__quickjs_yue = {
                    gui = require('yue.gui'),
                    windows = {},
                    next_window_handle = 0,
                    buttons = {},
                    next_button_handle = 0,
                    combo_boxes = {},
                    next_combo_box_handle = 0,
                    pickers = {},
                    next_picker_handle = 0,
                    progress_bars = {},
                    next_progress_bar_handle = 0,
                    separators = {},
                    next_separator_handle = 0,
                    sliders = {},
                    next_slider_handle = 0,
                    scrolls = {},
                    next_scroll_handle = 0,
                    tabs = {},
                    next_tab_handle = 0,
                    file_dialogs = {},
                    file_dialog_accepted = {},
                    file_dialog_results = {},
                    next_file_dialog_handle = 0,
                    menus = {},
                    next_menu_handle = 0,
                    menu_items = {},
                    next_menu_item_handle = 0,
                    menu_item_parents = setmetatable({}, { __mode = 'k' }),
                    menu_parents = setmetatable({}, { __mode = 'k' }),
                    menu_submenus = setmetatable({}, { __mode = 'k' }),
                    menu_item_types = setmetatable({}, { __mode = 'k' }),
                    tray_menus = setmetatable({}, { __mode = 'k' }),
                    tray_menu_owners = setmetatable({}, { __mode = 'k' }),
                    window_menu_owners = setmetatable({}, { __mode = 'k' }),
                    -- Content and page views use a raw parent pointer.
                    view_parent_owners = setmetatable({}, { __mode = 'k' }),
                    containers = {},
                    next_container_handle = 0,
                    -- Content views keep a raw parent pointer, so retain their group.
                    container_owners = {},
                    groups = {},
                    next_group_handle = 0,
                    labels = {},
                    next_label_handle = 0,
                    attributed_texts = {},
                    next_attributed_text_handle = 0,
                    views = {},
                    next_view_handle = 0,
                    images = {},
                    next_image_handle = 0,
                    fonts = {},
                    next_font_handle = 0,
                    cursors = {},
                    next_cursor_handle = 0,
                    date_pickers = {},
                    next_date_picker_handle = 0,
                    entries = {},
                    next_entry_handle = 0,
                    notifications = {},
                    next_notification_handle = 0,
                    canvases = {},
                    next_canvas_handle = 0,
                    trays = {},
                    next_tray_handle = 0
                }
            end
        `);
    }

    destroy(): void {
        if (this.eventBridge) {
            this.eventBridge.destroy();
        }
        this.eventBridge = undefined;
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
