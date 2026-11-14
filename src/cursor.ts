import { Yue } from './yue';

export type CursorType =
    | 'default'
    | 'hand'
    | 'crosshair'
    | 'progress'
    | 'text'
    | 'not-allowed'
    | 'help'
    | 'move'
    | 'resize-ew'
    | 'resize-ns'
    | 'resize-nesw'
    | 'resize-nwse';

/** A native cursor kept in the Lua state. */
export class Cursor {
    readonly handle: number;
    private readonly yue: Yue;

    /** Registers the cursor produced by a Lua expression. Prefer `createWithType()`. */
    constructor(luaExpression: string, yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local cursor = assert(${luaExpression}, 'Cursor could not be created')
            runtime.next_cursor_handle = runtime.next_cursor_handle + 1
            runtime.cursors[runtime.next_cursor_handle] = cursor
            return runtime.next_cursor_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Cursor creation returned an invalid handle.');
        }
        this.handle = handle;
    }

    static createWithType(type: CursorType, yue: Yue = Yue.default): Cursor {
        return new Cursor(`_G.__quickjs_yue.gui.Cursor.createwithtype(${Yue.toLuaStringLiteral(type)})`, yue);
    }

    getRuntime(): Yue {
        return this.yue;
    }

    dispose(): void {
        this.yue.eval(`_G.__quickjs_yue.cursors[${this.handle}] = nil`);
    }
}
