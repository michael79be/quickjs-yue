import { Yue } from './yue';

export type FontWeight =
    | 'thin'
    | 'extra-light'
    | 'light'
    | 'normal'
    | 'medium'
    | 'semi-bold'
    | 'bold'
    | 'extra-bold'
    | 'black';

export type FontStyle = 'normal' | 'italic';

/** A native font kept in the Lua state. */
export class Font {
    readonly handle: number;
    private readonly yue: Yue;

    /** Registers the font produced by a Lua expression. Prefer the factory methods. */
    constructor(luaExpression: string, yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local font = assert(${luaExpression}, 'Font could not be created')
            runtime.next_font_handle = runtime.next_font_handle + 1
            runtime.fonts[runtime.next_font_handle] = font
            return runtime.next_font_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] Font creation returned an invalid handle.');
        }
        this.handle = handle;
    }

    static default(yue: Yue = Yue.default): Font {
        return new Font('_G.__quickjs_yue.gui.Font.default()', yue);
    }

    static create(name: string, size: number, weight: FontWeight, style: FontStyle, yue: Yue = Yue.default): Font {
        const luaSize = Font.size(size);
        return new Font(
            `_G.__quickjs_yue.gui.Font.create(${Yue.toLuaStringLiteral(name)}, ${luaSize}, ` +
            `${Yue.toLuaStringLiteral(weight)}, ${Yue.toLuaStringLiteral(style)})`,
            yue,
        );
    }

    /** Yue may fall back to the default font if the file cannot be loaded. */
    static createFromPath(path: string, size: number, yue: Yue = Yue.default): Font {
        return new Font(
            `_G.__quickjs_yue.gui.Font.createfrompath(${Yue.toLuaStringLiteral(path)}, ${Font.size(size)})`,
            yue,
        );
    }

    derive(sizeDelta: number, weight: FontWeight, style: FontStyle): Font {
        if (!Number.isFinite(sizeDelta) || this.getSize() + sizeDelta <= 0) {
            throw new RangeError('The derived font size must be a finite positive number.');
        }
        return new Font(
            `assert(_G.__quickjs_yue.fonts[${this.handle}], 'Font is no longer available'):derive(` +
            `${sizeDelta}, ${Yue.toLuaStringLiteral(weight)}, ${Yue.toLuaStringLiteral(style)})`,
            this.yue,
        );
    }

    getName(): string {
        const name = this.call('return font:getname()');
        if (typeof name !== 'string') throw new Error('[Yue] Invalid font name.');
        return name;
    }

    getSize(): number {
        const result = this.call('return tostring(font:getsize())');
        if (typeof result !== 'string' || result === '') throw new Error('[Yue] Invalid font size.');
        const size = Number(result);
        if (!Number.isFinite(size) || size <= 0) throw new Error('[Yue] Invalid font size.');
        return size;
    }

    getWeight(): FontWeight {
        const weight = this.call('return font:getweight()');
        switch (weight) {
            case 'thin':
            case 'extra-light':
            case 'light':
            case 'normal':
            case 'medium':
            case 'semi-bold':
            case 'bold':
            case 'extra-bold':
            case 'black':
                return weight;
            default:
                throw new Error('[Yue] Invalid font weight.');
        }
    }

    getStyle(): FontStyle {
        const style = this.call('return font:getstyle()');
        if (style !== 'normal' && style !== 'italic') throw new Error('[Yue] Invalid font style.');
        return style;
    }

    getRuntime(): Yue {
        return this.yue;
    }

    dispose(): void {
        this.yue.eval(`_G.__quickjs_yue.fonts[${this.handle}] = nil`);
    }

    private static size(size: number): string {
        if (!Number.isFinite(size) || size <= 0) throw new RangeError('Font size must be a finite positive number.');
        return String(size);
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local font = assert(_G.__quickjs_yue.fonts[${this.handle}], 'Font is no longer available')
            ${statement}
        `);
    }
}
