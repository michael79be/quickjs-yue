import * as os from 'os';
import { Font } from './font';
import type { Size } from './image';
import type { TextAlign } from './view/label';
import type { Rect } from './painter';
import { Yue } from './yue';

export interface TextFormat {
    align?: TextAlign;
    valign?: TextAlign;
    wrap?: boolean;
    ellipsis?: boolean;
}

export interface TextAttributes extends TextFormat {
    font?: Font;
    color?: string;
}

export class AttributedText {
    readonly handle: number;
    private readonly yue: Yue;

    /** Registers the native text produced by a Lua expression. Prefer `create()`. */
    constructor(luaExpression: string, yue: Yue = Yue.default) {
        this.yue = yue;
        this.yue.ensureGuiRuntime();
        const handle = this.yue.eval(`
            local runtime = _G.__quickjs_yue
            local text = assert(${luaExpression}, 'AttributedText could not be created')
            runtime.next_attributed_text_handle = runtime.next_attributed_text_handle + 1
            runtime.attributed_texts[runtime.next_attributed_text_handle] = text
            return runtime.next_attributed_text_handle
        `);
        if (typeof handle !== 'number' || !Number.isSafeInteger(handle) || handle < 1) {
            throw new Error('[Yue] AttributedText creation returned an invalid handle.');
        }
        this.handle = handle;
    }

    static create(text: string, attributes: TextAttributes = {}, yue: Yue = Yue.default): AttributedText {
        const values = AttributedText.formatFields(attributes);
        if (attributes.font !== undefined) values.push(`font = ${AttributedText.fontExpression(attributes.font, yue)}`);
        if (attributes.color !== undefined) values.push(`color = ${Yue.toLuaStringLiteral(attributes.color)}`);
        return new AttributedText(
            `_G.__quickjs_yue.gui.AttributedText.create(${AttributedText.luaText(text)}, { ${values.join(', ')} })`,
            yue,
        );
    }

    setFormat(format: TextFormat): void {
        this.call(`text:setformat({ ${AttributedText.formatFields(format).join(', ')} })`);
    }

    getFormat(): TextFormat {
        const align = this.call('return text:getformat().align');
        const valign = this.call('return text:getformat().valign');
        const wrap = this.call('return text:getformat().wrap');
        const ellipsis = this.call('return text:getformat().ellipsis');
        if ((align !== 'start' && align !== 'center' && align !== 'end') ||
            (valign !== 'start' && valign !== 'center' && valign !== 'end') ||
            typeof wrap !== 'boolean' || typeof ellipsis !== 'boolean') {
            throw new Error('[Yue] Invalid text format.');
        }
        return { align, valign, wrap, ellipsis };
    }

    setFont(font: Font): void {
        this.call(`text:setfont(${AttributedText.fontExpression(font, this.yue)})`);
    }

    /** Range is zero-based, end-exclusive UTF-16 indices; -1 means the rest. Not supported on Windows. */
    setFontFor(font: Font, start: number, end: number): void {
        const range = this.range(start, end);
        this.call(`text:setfontfor(${AttributedText.fontExpression(font, this.yue)}, ${range})`);
    }

    setColor(color: string): void {
        this.call(`text:setcolor(${Yue.toLuaStringLiteral(color)})`);
    }

    /** Range is zero-based, end-exclusive UTF-16 indices; -1 means the rest. Not supported on Windows. */
    setColorFor(color: string, start: number, end: number): void {
        const range = this.range(start, end);
        this.call(`text:setcolorfor(${Yue.toLuaStringLiteral(color)}, ${range})`);
    }

    clear(): void {
        this.call('text:clear()');
    }

    getBoundsFor(size: Size): Rect {
        if (!Number.isFinite(size.width) || size.width < 0 ||
            !Number.isFinite(size.height) || size.height < 0) {
            throw new RangeError('Text bounds size must contain finite non-negative numbers.');
        }
        const bounds = `text:getboundsfor({ width = ${size.width}, height = ${size.height} })`;
        const read = (field: string): number => {
            const value = this.call(`return tostring(${bounds}.${field})`);
            if (typeof value !== 'string' || value === '' || !Number.isFinite(Number(value))) {
                throw new Error('[Yue] Invalid text bounds.');
            }
            return Number(value);
        };
        return { x: read('x'), y: read('y'), width: read('width'), height: read('height') };
    }

    setText(text: string): void {
        this.call(`text:settext(${AttributedText.luaText(text)})`);
    }

    getText(): string {
        const text = this.call('return text:gettext()');
        if (typeof text !== 'string') throw new Error('[Yue] Invalid attributed text.');
        return text;
    }

    getRuntime(): Yue {
        return this.yue;
    }

    dispose(): void {
        this.yue.eval(`_G.__quickjs_yue.attributed_texts[${this.handle}] = nil`);
    }

    private range(start: number, end: number): string {
        if (os.platform === 'win32') throw new Error('[Yue] Text range styling is not supported on Windows.');
        const text = this.getText();
        const limit = end === -1 ? text.length : end;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
            start < 0 || limit > text.length || limit <= start) {
            throw new RangeError('Text range must be a non-empty range within the text.');
        }
        const splitsSurrogate = (index: number): boolean =>
            index > 0 && index < text.length &&
            text.charCodeAt(index - 1) >= 0xd800 && text.charCodeAt(index - 1) <= 0xdbff &&
            text.charCodeAt(index) >= 0xdc00 && text.charCodeAt(index) <= 0xdfff;
        if (splitsSurrogate(start) || splitsSurrogate(limit)) {
            throw new RangeError('Text range cannot split a surrogate pair.');
        }
        return `${start + 1}, ${end === -1 ? -1 : end + 1}`;
    }

    private static fontExpression(font: Font, yue: Yue): string {
        if (font.getRuntime() !== yue) throw new Error('[Yue] Font and text belong to different runtimes.');
        return `assert(_G.__quickjs_yue.fonts[${font.handle}], 'Font is no longer available')`;
    }

    private static luaText(text: string): string {
        if (text.includes('\0')) throw new RangeError('AttributedText cannot contain NUL.');
        return Yue.toLuaStringLiteral(text);
    }

    private static formatFields(format: TextFormat): string[] {
        const fields: string[] = [];
        if (format.align !== undefined) fields.push(`align = ${Yue.toLuaStringLiteral(format.align)}`);
        if (format.valign !== undefined) fields.push(`valign = ${Yue.toLuaStringLiteral(format.valign)}`);
        if (format.wrap !== undefined) fields.push(`wrap = ${format.wrap}`);
        if (format.ellipsis !== undefined) fields.push(`ellipsis = ${format.ellipsis}`);
        return fields;
    }

    private call(statement: string): string | number | boolean | null {
        return this.yue.eval(`
            local text = assert(_G.__quickjs_yue.attributed_texts[${this.handle}], 'AttributedText is no longer available')
            ${statement}
        `);
    }
}
